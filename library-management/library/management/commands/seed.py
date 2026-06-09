from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from library.models import Book, Student

User = get_user_model()

BOOKS = [
    ("The Pragmatic Programmer", "Andrew Hunt", 3),
    ("Clean Code", "Robert C. Martin", 2),
    ("Introduction to Algorithms", "Thomas H. Cormen", 2),
    ("The Great Gatsby", "F. Scott Fitzgerald", 4),
    ("To Kill a Mockingbird", "Harper Lee", 3),
    ("Sapiens: A Brief History of Humankind", "Yuval Noah Harari", 2),
    ("Atomic Habits", "James Clear", 5),
    ("Deep Learning", "Ian Goodfellow", 1),
]


class Command(BaseCommand):
    help = "Seed the library with a librarian account, sample books and demo students."

    def handle(self, *args, **options):
        # Librarian (admin) account
        if not User.objects.filter(username="librarian").exists():
            User.objects.create_superuser("librarian", "librarian@example.com", "admin123")
            self.stdout.write(self.style.SUCCESS("Created librarian (username: librarian / password: admin123)"))
        else:
            self.stdout.write("Librarian already exists.")

        # Books
        created_books = 0
        for name, author, copies in BOOKS:
            _, created = Book.objects.get_or_create(
                name=name, author=author, defaults={"total_copies": copies}
            )
            created_books += 1 if created else 0
        self.stdout.write(self.style.SUCCESS(f"Books seeded ({created_books} new)."))

        # Demo students: one verified, one pending
        if not Student.objects.filter(roll_number="2024CS001").exists():
            s = Student(roll_number="2024CS001", name="Aarav Sharma", is_verified=True)
            s.set_password("student123")
            s.save()
            self.stdout.write(self.style.SUCCESS("Verified student: roll 2024CS001 / password student123"))

        if not Student.objects.filter(roll_number="2024CS002").exists():
            s = Student(roll_number="2024CS002", name="Diya Patel", is_verified=False)
            s.set_password("student123")
            s.save()
            self.stdout.write(self.style.SUCCESS("Pending student: roll 2024CS002 (awaiting verification)"))

        self.stdout.write(self.style.SUCCESS("Done."))
