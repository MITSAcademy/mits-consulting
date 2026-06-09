from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),

    # Student auth + dashboard
    path("student/register/", views.student_register, name="student_register"),
    path("student/login/", views.student_login, name="student_login"),
    path("student/logout/", views.student_logout, name="student_logout"),
    path("student/dashboard/", views.student_dashboard, name="student_dashboard"),
    path("student/borrow/<int:book_id>/", views.borrow_book, name="borrow_book"),
    path("student/return/<int:record_id>/", views.return_book, name="return_book"),

    # Librarian auth + management
    path("librarian/login/", views.librarian_login, name="librarian_login"),
    path("librarian/logout/", views.librarian_logout, name="librarian_logout"),
    path("librarian/dashboard/", views.librarian_dashboard, name="librarian_dashboard"),
    path("librarian/books/", views.manage_books, name="manage_books"),
    path("librarian/books/<int:book_id>/delete/", views.delete_book, name="delete_book"),
    path("librarian/students/", views.manage_students, name="manage_students"),
    path("librarian/students/<int:student_id>/verify/", views.verify_student, name="verify_student"),
    path("librarian/students/<int:student_id>/revoke/", views.revoke_student, name="revoke_student"),
]
