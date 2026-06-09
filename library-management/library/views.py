from functools import wraps

from django.contrib import messages
from django.contrib.auth import authenticate
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from .forms import (
    BookForm,
    LibrarianLoginForm,
    StudentLoginForm,
    StudentRegisterForm,
)
from .models import Book, BorrowRecord, Student

STUDENT_SESSION_KEY = "student_id"


# ---------- helpers ----------
def get_current_student(request):
    sid = request.session.get(STUDENT_SESSION_KEY)
    if not sid:
        return None
    return Student.objects.filter(id=sid, is_verified=True).first()


def student_login_required(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        student = get_current_student(request)
        if not student:
            messages.warning(request, "Please log in with your roll number to continue.")
            return redirect("student_login")
        request.student = student
        return view(request, *args, **kwargs)

    return wrapper


# ---------- public ----------
def home(request):
    return render(request, "library/home.html")


# ---------- student auth ----------
def student_register(request):
    if request.method == "POST":
        form = StudentRegisterForm(request.POST)
        if form.is_valid():
            student = form.save(commit=False)
            student.set_password(form.cleaned_data["password"])
            student.is_verified = False  # awaits librarian verification
            student.save()
            messages.success(
                request,
                "Registration submitted! A librarian must verify your account before you can log in.",
            )
            return redirect("student_login")
    else:
        form = StudentRegisterForm()
    return render(request, "library/student_register.html", {"form": form})


def student_login(request):
    if request.method == "POST":
        form = StudentLoginForm(request.POST)
        if form.is_valid():
            roll = form.cleaned_data["roll_number"].strip()
            password = form.cleaned_data["password"]
            student = Student.objects.filter(roll_number__iexact=roll).first()
            if not student:
                messages.error(request, "No student is registered with that roll number. Please register first.")
            elif not student.check_password(password):
                messages.error(request, "Incorrect password. Please try again.")
            elif not student.is_verified:
                messages.warning(request, "Your account is awaiting verification by the librarian.")
            else:
                request.session[STUDENT_SESSION_KEY] = student.id
                messages.success(request, f"Welcome back, {student.name}!")
                return redirect("student_dashboard")
    else:
        form = StudentLoginForm()
    return render(request, "library/student_login.html", {"form": form})


def student_logout(request):
    request.session.pop(STUDENT_SESSION_KEY, None)
    messages.info(request, "You have been logged out.")
    return redirect("home")


@student_login_required
def student_dashboard(request):
    student = request.student
    books = Book.objects.all()
    active = student.borrow_records.filter(returned_at__isnull=True).select_related("book")
    history = student.borrow_records.filter(returned_at__isnull=False).select_related("book")
    return render(
        request,
        "library/student_dashboard.html",
        {"student": student, "books": books, "active": active, "history": history},
    )


# ---------- librarian auth ----------
def librarian_login(request):
    if request.user.is_authenticated and request.user.is_staff:
        return redirect("librarian_dashboard")
    if request.method == "POST":
        form = LibrarianLoginForm(request.POST)
        if form.is_valid():
            user = authenticate(
                request,
                username=form.cleaned_data["username"],
                password=form.cleaned_data["password"],
            )
            if user is not None and user.is_staff:
                auth_login(request, user)
                messages.success(request, "Logged in as librarian.")
                return redirect("librarian_dashboard")
            messages.error(request, "Invalid librarian credentials.")
    else:
        form = LibrarianLoginForm()
    return render(request, "library/librarian_login.html", {"form": form})


def librarian_logout(request):
    auth_logout(request)
    messages.info(request, "Librarian logged out.")
    return redirect("home")


@login_required
def librarian_dashboard(request):
    if not request.user.is_staff:
        messages.error(request, "Librarian access only.")
        return redirect("home")
    stats = {
        "books": Book.objects.count(),
        "students": Student.objects.count(),
        "pending": Student.objects.filter(is_verified=False).count(),
        "issued": BorrowRecord.objects.filter(returned_at__isnull=True).count(),
    }
    pending = Student.objects.filter(is_verified=False)
    recent_issues = BorrowRecord.objects.filter(returned_at__isnull=True).select_related("book", "student")[:8]
    return render(
        request,
        "library/librarian_dashboard.html",
        {"stats": stats, "pending": pending, "recent_issues": recent_issues},
    )


@login_required
def manage_books(request):
    if not request.user.is_staff:
        return redirect("home")
    if request.method == "POST":
        form = BookForm(request.POST)
        if form.is_valid():
            book = form.save()
            messages.success(request, f'Added "{book.name}".')
            return redirect("manage_books")
    else:
        form = BookForm()
    books = Book.objects.all()
    return render(request, "library/manage_books.html", {"form": form, "books": books})


@login_required
def delete_book(request, book_id):
    if not request.user.is_staff:
        return redirect("home")
    book = get_object_or_404(Book, id=book_id)
    if request.method == "POST":
        name = book.name
        book.delete()
        messages.info(request, f'Removed "{name}".')
    return redirect("manage_books")


@login_required
def manage_students(request):
    if not request.user.is_staff:
        return redirect("home")
    students = Student.objects.all()
    return render(request, "library/manage_students.html", {"students": students})


@login_required
def verify_student(request, student_id):
    if not request.user.is_staff:
        return redirect("home")
    student = get_object_or_404(Student, id=student_id)
    if request.method == "POST":
        student.is_verified = True
        student.save()
        messages.success(request, f"Verified {student.name} ({student.roll_number}).")
    return redirect("manage_students")


@login_required
def revoke_student(request, student_id):
    if not request.user.is_staff:
        return redirect("home")
    student = get_object_or_404(Student, id=student_id)
    if request.method == "POST":
        student.is_verified = False
        student.save()
        messages.warning(request, f"Revoked access for {student.name}.")
    return redirect("manage_students")


# ---------- borrowing ----------
@student_login_required
def borrow_book(request, book_id):
    book = get_object_or_404(Book, id=book_id)
    if request.method == "POST":
        already = request.student.borrow_records.filter(book=book, returned_at__isnull=True).exists()
        if already:
            messages.warning(request, "You already have this book.")
        elif not book.is_available:
            messages.error(request, "Sorry, no copies are currently available.")
        else:
            BorrowRecord.objects.create(student=request.student, book=book)
            messages.success(request, f'You borrowed "{book.name}".')
    return redirect("student_dashboard")


@student_login_required
def return_book(request, record_id):
    record = get_object_or_404(
        BorrowRecord, id=record_id, student=request.student, returned_at__isnull=True
    )
    if request.method == "POST":
        record.returned_at = timezone.now()
        record.save()
        messages.success(request, f'Returned "{record.book.name}".')
    return redirect("student_dashboard")
