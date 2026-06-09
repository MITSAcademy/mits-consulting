from django.contrib import admin

from .models import Book, BorrowRecord, Student


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("roll_number", "name", "is_verified", "created_at")
    list_filter = ("is_verified",)
    search_fields = ("roll_number", "name")
    actions = ["verify_selected"]

    @admin.action(description="Verify selected students")
    def verify_selected(self, request, queryset):
        queryset.update(is_verified=True)


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ("name", "author", "total_copies", "available_copies", "added_at")
    search_fields = ("name", "author")


@admin.register(BorrowRecord)
class BorrowRecordAdmin(admin.ModelAdmin):
    list_display = ("book", "student", "issued_at", "returned_at", "is_active")
    list_filter = ("returned_at",)
