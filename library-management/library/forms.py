from django import forms

from .models import Book, Student

BS = "form-control"


class StudentRegisterForm(forms.ModelForm):
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={"class": BS, "placeholder": "Choose a password"}),
        min_length=4,
    )
    confirm_password = forms.CharField(
        widget=forms.PasswordInput(attrs={"class": BS, "placeholder": "Re-enter password"}),
    )

    class Meta:
        model = Student
        fields = ["name", "roll_number"]
        widgets = {
            "name": forms.TextInput(attrs={"class": BS, "placeholder": "Full name"}),
            "roll_number": forms.TextInput(attrs={"class": BS, "placeholder": "e.g. 2024CS015"}),
        }

    def clean_roll_number(self):
        roll = self.cleaned_data["roll_number"].strip()
        if Student.objects.filter(roll_number__iexact=roll).exists():
            raise forms.ValidationError("That roll number is already registered.")
        return roll

    def clean(self):
        cleaned = super().clean()
        if cleaned.get("password") != cleaned.get("confirm_password"):
            self.add_error("confirm_password", "Passwords do not match.")
        return cleaned


class StudentLoginForm(forms.Form):
    roll_number = forms.CharField(
        widget=forms.TextInput(attrs={"class": BS, "placeholder": "Your roll number"})
    )
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={"class": BS, "placeholder": "Your password"})
    )


class LibrarianLoginForm(forms.Form):
    username = forms.CharField(
        widget=forms.TextInput(attrs={"class": BS, "placeholder": "Librarian username"})
    )
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={"class": BS, "placeholder": "Password"})
    )


class BookForm(forms.ModelForm):
    class Meta:
        model = Book
        fields = ["name", "author", "total_copies"]
        widgets = {
            "name": forms.TextInput(attrs={"class": BS, "placeholder": "Book name"}),
            "author": forms.TextInput(attrs={"class": BS, "placeholder": "Author name"}),
            "total_copies": forms.NumberInput(attrs={"class": BS, "min": 1}),
        }
