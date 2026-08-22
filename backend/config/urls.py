"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView


admin.site.site_header = "Karmasheel Administration"
admin.site.site_title = "Karmasheel Administration"
admin.site.index_title = "Karmasheel Administration"


urlpatterns = [
    path(
        "",
        TemplateView.as_view(template_name="frontend/index.html"),
        name="frontend",
    ),

    path("admin/", admin.site.urls),

    path(
        "api/auth/",
        include("accounts.urls"),
    ),

    path(
        "api/profiles/",
        include("profiles.urls"),
    ),

    path(
        "api/taxonomy/",
        include("taxonomy.urls"),
    ),

    path(
        "api/jobs/",
        include("jobs.urls"),
    ),

    path(
        "api/applications/",
        include("applications.urls"),
    ),

    path(
        "api/recommendations/",
        include("recommendations.urls"),
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
