from django.contrib.auth.hashers import make_password, check_password
from django.db import models
from django.utils import timezone


class Student(models.Model):
    """A library member. Registers with a roll number and can only log in
    once a librarian has verified the account."""

    roll_number = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=120)
    password = models.CharField(max_length=128)  # stored hashed
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["roll_number"]

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password)

    @property
    def active_borrow_count(self):
        return self.borrow_records.filter(returned_at__isnull=True).count()

    def __str__(self):
        return f"{self.name} ({self.roll_number})"


class Book(models.Model):
    """A book in the library catalogue."""

    name = models.CharField(max_length=200)
    author = models.CharField(max_length=120)
    total_copies = models.PositiveIntegerField(default=1)
    added_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["name"]

    @property
    def borrowed_count(self):
        return self.borrow_records.filter(returned_at__isnull=True).count()

    @property
    def available_copies(self):
        return max(self.total_copies - self.borrowed_count, 0)

    @property
    def is_available(self):
        return self.available_copies > 0

    def __str__(self):
        return f"{self.name} by {self.author}"


class BorrowRecord(models.Model):
    """Tracks a book issued to a student until it is returned."""

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="borrow_records")
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name="borrow_records")
    issued_at = models.DateTimeField(default=timezone.now)
    returned_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-issued_at"]

    @property
    def is_active(self):
        return self.returned_at is None

    def __str__(self):
        state = "active" if self.is_active else "returned"
        return f"{self.book.name} -> {self.student.roll_number} ({state})"
