from django.urls import path

from .views import (
    CategoryListView,
    SkillTagListView,
    SubcategoryListView,
    TaxonomyTreeView,
)

app_name = "taxonomy"

urlpatterns = [
    path("categories/", CategoryListView.as_view(), name="categories"),
    path("subcategories/", SubcategoryListView.as_view(), name="subcategories"),
    path("skills/", SkillTagListView.as_view(), name="skills"),
    path("tree/", TaxonomyTreeView.as_view(), name="tree"),
]
