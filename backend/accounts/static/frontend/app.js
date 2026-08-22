(() => {
    "use strict";

    const state = {
        access: sessionStorage.getItem("workforce_matching_access") || "",
        refresh: sessionStorage.getItem("workforce_matching_refresh") || "",
        user: null,
        taxonomy: [],
        publicJobs: [],
        employerJobs: [],
    };

    const byId = (id) => document.getElementById(id);
    const all = (selector) => Array.from(document.querySelectorAll(selector));

    class ApiError extends Error {
        constructor(status, payload) {
            super(readableError(payload) || `Request failed with status ${status}.`);
            this.status = status;
            this.payload = payload;
        }
    }

    function readableError(payload) {
        if (!payload) return "";
        if (typeof payload === "string") return payload;
        if (Array.isArray(payload)) return payload.map(readableError).filter(Boolean).join(" ");
        if (payload.detail) return readableError(payload.detail);

        return Object.entries(payload)
            .map(([field, value]) => `${humanize(field)}: ${readableError(value)}`)
            .join(" ");
    }

    function humanize(value) {
        return String(value || "")
            .replaceAll("_", " ")
            .toLowerCase()
            .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    function element(tag, className = "", text = "") {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== "") node.textContent = text;
        return node;
    }

    function persistTokens() {
        if (state.access) sessionStorage.setItem("workforce_matching_access", state.access);
        else sessionStorage.removeItem("workforce_matching_access");

        if (state.refresh) sessionStorage.setItem("workforce_matching_refresh", state.refresh);
        else sessionStorage.removeItem("workforce_matching_refresh");
    }

    function clearSession() {
        state.access = "";
        state.refresh = "";
        state.user = null;
        state.employerJobs = [];
        persistTokens();
    }

    async function refreshAccessToken() {
        if (!state.refresh) throw new ApiError(401, {detail: "Your session has expired. Please sign in again."});

        const response = await fetch("/api/auth/token/refresh/", {
            method: "POST",
            headers: {"Content-Type": "application/json", Accept: "application/json"},
            body: JSON.stringify({refresh: state.refresh}),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            clearSession();
            renderSession();
            throw new ApiError(response.status, payload);
        }

        state.access = payload.access;
        if (payload.refresh) state.refresh = payload.refresh;
        persistTokens();
    }

    async function request(path, options = {}) {
        const {
            method = "GET",
            body,
            auth = true,
            responseType = "json",
            retry = true,
        } = options;
        const headers = {Accept: responseType === "json" ? "application/json" : "*/*"};

        if (body !== undefined) headers["Content-Type"] = "application/json";
        if (auth && state.access) headers.Authorization = `Bearer ${state.access}`;

        const response = await fetch(path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });

        if (response.status === 401 && auth && retry && state.refresh) {
            await refreshAccessToken();
            return request(path, {...options, retry: false});
        }

        let payload = null;
        if (response.status !== 204) {
            if (responseType === "blob") payload = await response.blob();
            else if (responseType === "text") payload = await response.text();
            else payload = await response.json().catch(() => ({}));
        }

        if (!response.ok) throw new ApiError(response.status, payload);
        return payload;
    }

    let flashTimer = null;

    function showFlash(message, type = "success") {
        const flash = byId("flash-message");
        window.clearTimeout(flashTimer);
        flash.textContent = message;
        flash.classList.toggle("error", type === "error");
        flash.hidden = false;
        flashTimer = window.setTimeout(() => {
            flash.hidden = true;
        }, 7000);
    }

    async function runBusy(control, action) {
        const button = control.matches("button") ? control : control.querySelector("[type='submit']");
        const original = button ? button.textContent : "";
        if (button) {
            button.disabled = true;
            button.textContent = "Working…";
        }
        try {
            return await action();
        } catch (error) {
            showFlash(error.message || "Something went wrong.", "error");
            throw error;
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = original;
            }
        }
    }

    function renderSession() {
        const signedIn = Boolean(state.user);

        all(".anonymous-only").forEach((node) => {
            node.hidden = signedIn;
        });
        all(".authenticated-only").forEach((node) => {
            node.hidden = !signedIn;
        });
        all(".role-panel").forEach((node) => {
            node.hidden = !signedIn || node.dataset.role !== state.user.role;
        });

        byId("session-pill").textContent = signedIn
            ? `${humanize(state.user.role)} · ${state.user.username}`
            : "Guest";

        if (signedIn) {
            const summary = byId("account-summary");
            summary.replaceChildren();
            const name = element("strong", "", state.user.username);
            const details = element(
                "span",
                "",
                `${state.user.phone_number} · Contact ${state.user.is_contact_verified ? "verified" : "not verified"}`,
            );
            summary.append(name, details);
        }

        renderPublicJobs();
    }

    async function signIn(username, password) {
        const tokens = await request("/api/auth/login/", {
            method: "POST",
            body: {username, password},
            auth: false,
        });
        state.access = tokens.access;
        state.refresh = tokens.refresh;
        persistTokens();
        state.user = await request("/api/auth/me/");
        renderSession();
        await loadAuthenticatedWorkspace();
        await loadPublicJobs();
    }

    async function restoreSession() {
        if (!state.access && !state.refresh) {
            renderSession();
            return;
        }

        try {
            state.user = await request("/api/auth/me/");
            renderSession();
            await loadAuthenticatedWorkspace();
            await loadPublicJobs();
        } catch (error) {
            clearSession();
            renderSession();
            if (error.status !== 401) showFlash(error.message, "error");
        }
    }

    async function loadAuthenticatedWorkspace() {
        if (!state.user) return;
        const tasks = [loadProfile(), loadRatingSummary()];
        if (state.user.role === "WORKER") tasks.push(loadWorkerApplications());
        if (state.user.role === "EMPLOYER") tasks.push(loadEmployerJobs());

        const results = await Promise.allSettled(tasks);
        const failed = results.find((result) => result.status === "rejected");
        if (failed) showFlash(failed.reason.message, "error");
    }

    async function loadRatingSummary() {
        const summary = await request("/api/applications/ratings/summary/");
        byId("rating-summary").textContent = summary.average_rating === null
            ? "No ratings yet"
            : `★ ${Number(summary.average_rating).toFixed(2)} from ${summary.rating_count} rating(s)`;
    }

    async function loadTaxonomy() {
        state.taxonomy = await request("/api/taxonomy/tree/", {auth: false});
        populateCategorySelect(byId("job-filter-category"), "All categories");
        populateCategorySelect(byId("job-category"), "Choose category");
        populateSubcategorySelect(
            byId("job-filter-category"),
            byId("job-filter-subcategory"),
            "All subcategories",
        );
        populateSubcategorySelect(byId("job-category"), byId("job-subcategory"), "Choose subcategory");
    }

    function populateCategorySelect(select, placeholder) {
        const current = select.value;
        select.replaceChildren(new Option(placeholder, ""));
        state.taxonomy.forEach((category) => {
            select.add(new Option(category.name, category.id));
        });
        if (Array.from(select.options).some((option) => option.value === current)) select.value = current;
    }

    function populateSubcategorySelect(categorySelect, subcategorySelect, placeholder) {
        const current = subcategorySelect.value;
        const category = state.taxonomy.find((item) => String(item.id) === categorySelect.value);
        subcategorySelect.replaceChildren(new Option(placeholder, ""));
        (category?.subcategories || []).forEach((subcategory) => {
            subcategorySelect.add(new Option(subcategory.name, subcategory.id));
        });
        if (Array.from(subcategorySelect.options).some((option) => option.value === current)) {
            subcategorySelect.value = current;
        }
    }

    function splitPhrases(value) {
        return String(value || "")
            .split(",")
            .map((phrase) => phrase.trim())
            .filter(Boolean);
    }

    function nullableNumber(value, integer = false) {
        if (value === "" || value === null || value === undefined) return null;
        return integer ? Number.parseInt(value, 10) : Number(value);
    }

    function setFormValue(form, name, value) {
        const field = form.elements[name];
        if (!field) return;
        if (field.type === "checkbox") field.checked = Boolean(value);
        else field.value = value ?? "";
    }

    async function loadProfile() {
        const worker = state.user.role === "WORKER";
        const path = worker ? "/api/profiles/worker/me/" : "/api/profiles/employer/me/";
        const profile = await request(path);
        const form = byId(worker ? "worker-profile-form" : "employer-profile-form");

        Object.entries(profile).forEach(([name, value]) => setFormValue(form, name, value));

        if (worker) {
            setFormValue(form, "skill_input", (profile.skills || []).map((skill) => skill.name).join(", "));
        } else {
            const badge = byId("verification-badge");
            badge.textContent = humanize(profile.verification_status);
            badge.dataset.status = profile.verification_status;
        }
    }

    async function saveWorkerProfile(form) {
        const payload = {
            address: form.elements.address.value.trim(),
            latitude: nullableNumber(form.elements.latitude.value),
            longitude: nullableNumber(form.elements.longitude.value),
            experience_years: nullableNumber(form.elements.experience_years.value, true) ?? 0,
            is_available: form.elements.is_available.checked,
            expected_wage: nullableNumber(form.elements.expected_wage.value),
            preferred_travel_radius_km: nullableNumber(
                form.elements.preferred_travel_radius_km.value,
                true,
            ),
            skill_input: splitPhrases(form.elements.skill_input.value),
        };
        const profile = await request("/api/profiles/worker/me/", {method: "PATCH", body: payload});
        setFormValue(form, "skill_input", profile.skills.map((skill) => skill.name).join(", "));
        const unmatched = profile.unmatched_terms || [];
        showFlash(
            unmatched.length
                ? `Profile saved. These phrases await admin review: ${unmatched.join(", ")}.`
                : "Worker profile saved.",
            unmatched.length ? "error" : "success",
        );
        await loadPublicJobs();
    }

    async function saveEmployerProfile(form) {
        const profile = await request("/api/profiles/employer/me/", {
            method: "PATCH",
            body: {
                organization_name: form.elements.organization_name.value.trim(),
                address: form.elements.address.value.trim(),
                latitude: nullableNumber(form.elements.latitude.value),
                longitude: nullableNumber(form.elements.longitude.value),
                pan_vat_number: form.elements.pan_vat_number.value.trim(),
            },
        });
        byId("verification-badge").textContent = humanize(profile.verification_status);
        showFlash("Employer profile saved. An administrator can now review it.");
    }

    async function loadPublicJobs() {
        const form = byId("job-filter-form");
        const params = new URLSearchParams();
        const data = new FormData(form);
        for (const [key, value] of data.entries()) {
            if (String(value).trim()) params.set(key, String(value).trim());
        }
        const query = params.toString();
        state.publicJobs = await request(`/api/jobs/browse/${query ? `?${query}` : ""}`, {
            auth: Boolean(state.user),
        });
        renderPublicJobs();
    }

    function addTags(container, skills, emptyText = "No skills specified") {
        const list = element("div", "tag-list");
        if (!skills?.length) list.append(element("span", "tag", emptyText));
        else skills.forEach((skill) => list.append(element("span", "tag", skill.name)));
        container.append(list);
    }

    function jobCard(job, {showApply = true} = {}) {
        const card = element("article", "job-card");
        const header = element("div", "job-card-header");
        const headingGroup = element("div");
        headingGroup.append(
            element("h3", "", job.title),
            element("p", "", `${job.employer_name || "Employer"} · ${job.subcategory_name}`),
        );
        header.append(headingGroup, element("span", "status-tag", humanize(job.work_type)));
        card.append(header, element("p", "description", job.description || "No description supplied."));

        addTags(card, job.required_skills, "No required skills");

        const meta = element("div", "job-meta");
        [
            ["Wage", `NPR ${job.wage_amount} / ${humanize(job.wage_type)}`],
            ["Location", job.address],
            ["Experience", `${job.required_experience_years} year(s)`],
            ["Deadline", formatDate(job.application_deadline)],
        ].forEach(([label, value]) => {
            const cell = element("span");
            cell.append(element("strong", "", label), document.createTextNode(value || "Not specified"));
            meta.append(cell);
        });
        card.append(meta);

        if (showApply) {
            if (state.user?.role === "WORKER") {
                const button = element("button", "button button-primary button-small", "Apply");
                button.type = "button";
                button.dataset.action = "apply";
                button.dataset.jobId = job.id;
                card.append(button);
            } else if (!state.user) {
                const link = element("a", "button button-secondary button-small", "Sign in as a worker to apply");
                link.href = "#account-access";
                card.append(link);
            }
        }
        return card;
    }

    function renderPublicJobs() {
        const container = byId("public-job-list");
        if (!container) return;
        container.replaceChildren();

        if (!state.publicJobs.length) {
            container.append(element("div", "empty-state", "No active jobs match these filters."));
            return;
        }
        state.publicJobs.forEach((job) => container.append(jobCard(job)));
    }

    function formatDate(value) {
        if (!value) return "Open";
        const date = new Date(value);
        return Number.isNaN(date.valueOf())
            ? String(value)
            : new Intl.DateTimeFormat("en-NP", {dateStyle: "medium"}).format(date);
    }

    async function applyToJob(jobId) {
        await request("/api/applications/", {
            method: "POST",
            body: {job: Number(jobId), worker_note: "Applied through the Workforce Matching demo interface."},
        });
        showFlash("Application submitted.");
        await loadWorkerApplications();
    }

    async function loadWorkerApplications() {
        const applications = await request("/api/applications/");
        const container = byId("worker-application-list");
        container.replaceChildren();

        if (!applications.length) {
            container.append(element("div", "empty-state", "You have not applied to a job yet."));
            return;
        }

        applications.forEach((application) => {
            const item = element("div", "stack-item");
            const row = element("div", "item-row");
            const text = element("div");
            text.append(
                element("h4", "", application.job_title),
                element("p", "", `Applied ${formatDate(application.created_at)}`),
            );
            row.append(text, element("span", "status-tag", humanize(application.status)));
            item.append(row);

            const actions = element("div", "stack-actions");
            if (["APPLIED", "SHORTLISTED", "CONTACTED"].includes(application.status)) {
                const withdraw = element("button", "button button-danger button-small", "Withdraw");
                withdraw.type = "button";
                withdraw.dataset.action = "transition";
                withdraw.dataset.applicationId = application.id;
                withdraw.dataset.status = "WITHDRAWN";
                actions.append(withdraw);
            }
            if (application.can_rate) {
                const rate = element("button", "button button-secondary button-small", "Rate employer");
                rate.type = "button";
                rate.dataset.action = "rate";
                rate.dataset.applicationId = application.id;
                rate.dataset.jobId = application.job;
                actions.append(rate);
            } else if (application.has_rated) {
                actions.append(element("span", "status-tag", "Rating submitted"));
            }
            if (actions.childElementCount) item.append(actions);
            container.append(item);
        });
    }

    function localDateTimeToIso(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.valueOf()) ? value : date.toISOString();
    }

    async function createJob(form) {
        const payload = {
            title: form.elements.title.value.trim(),
            category: Number(form.elements.category.value),
            subcategory: Number(form.elements.subcategory.value),
            description: form.elements.description.value.trim(),
            address: form.elements.address.value.trim(),
            latitude: Number(form.elements.latitude.value),
            longitude: Number(form.elements.longitude.value),
            required_experience_years: Number(form.elements.required_experience_years.value),
            wage_type: form.elements.wage_type.value,
            wage_amount: form.elements.wage_amount.value,
            work_type: form.elements.work_type.value,
            duration_days: nullableNumber(form.elements.duration_days.value, true),
            number_of_workers_required: Number(form.elements.number_of_workers_required.value),
            application_deadline: localDateTimeToIso(form.elements.application_deadline.value),
            required_skills_input: splitPhrases(form.elements.required_skills_input.value),
            preferred_skills_input: splitPhrases(form.elements.preferred_skills_input.value),
            status: "ACTIVE",
        };
        const job = await request("/api/jobs/", {method: "POST", body: payload});
        const unmatched = [
            ...(job.unmatched_required_terms || []),
            ...(job.unmatched_preferred_terms || []),
        ];
        showFlash(
            unmatched.length
                ? `Job published. These phrases await admin review: ${unmatched.join(", ")}.`
                : "Job published.",
            unmatched.length ? "error" : "success",
        );
        form.reset();
        populateSubcategorySelect(byId("job-category"), byId("job-subcategory"), "Choose subcategory");
        await Promise.all([loadEmployerJobs(), loadPublicJobs()]);
    }

    async function loadEmployerJobs() {
        state.employerJobs = await request("/api/jobs/");
        const container = byId("employer-job-list");
        container.replaceChildren();

        if (!state.employerJobs.length) {
            container.append(element("div", "empty-state", "No job posts yet."));
            return;
        }

        state.employerJobs.forEach((job) => {
            const item = element("div", "stack-item");
            const row = element("div", "item-row");
            const text = element("div");
            text.append(
                element("h4", "", job.title),
                element("p", "", `${job.subcategory_name} · NPR ${job.wage_amount} / ${humanize(job.wage_type)}`),
            );
            row.append(text, element("span", "status-tag", humanize(job.status)));
            item.append(row);

            const actions = element("div", "stack-actions");
            [
                ["applications", "Applications", "button-secondary"],
                ["recommend-workers", "Rank workers", "button-primary"],
            ].forEach(([action, label, style]) => {
                const button = element("button", `button ${style} button-small`, label);
                button.type = "button";
                button.dataset.action = action;
                button.dataset.jobId = job.id;
                actions.append(button);
            });
            if (job.status === "ACTIVE") {
                const close = element("button", "button button-danger button-small", "Close job");
                close.type = "button";
                close.dataset.action = "close-job";
                close.dataset.jobId = job.id;
                actions.append(close);
            }
            item.append(actions);
            container.append(item);
        });
    }

    async function closeJob(jobId) {
        await request(`/api/jobs/${jobId}/`, {method: "PATCH", body: {status: "CLOSED"}});
        showFlash("Job closed.");
        await Promise.all([loadEmployerJobs(), loadPublicJobs()]);
    }

    const employerTransitions = {
        APPLIED: ["SHORTLISTED", "CONTACTED", "REJECTED"],
        SHORTLISTED: ["CONTACTED", "HIRED", "REJECTED"],
        CONTACTED: ["HIRED", "REJECTED"],
        HIRED: ["COMPLETED", "CANCELLED"],
    };

    async function loadEmployerApplications(jobId) {
        const job = state.employerJobs.find((item) => String(item.id) === String(jobId));
        const applications = await request(`/api/jobs/${jobId}/applications/`);
        byId("employer-applications-title").textContent = job
            ? `Applications · ${job.title}`
            : "Job applications";
        const container = byId("employer-application-list");
        container.classList.remove("empty-state");
        container.replaceChildren();

        if (!applications.length) {
            container.classList.add("empty-state");
            container.textContent = "No workers have applied to this job yet.";
            return;
        }

        applications.forEach((application) => {
            const item = element("div", "stack-item");
            const row = element("div", "item-row");
            const text = element("div");
            text.append(
                element("h4", "", application.worker_username),
                element("p", "", application.worker_note || "No worker note."),
            );
            row.append(text, element("span", "status-tag", humanize(application.status)));
            item.append(row);

            const actions = element("div", "stack-actions");
            (employerTransitions[application.status] || []).forEach((status) => {
                const button = element(
                    "button",
                    `button ${status === "REJECTED" || status === "CANCELLED" ? "button-danger" : "button-secondary"} button-small`,
                    humanize(status),
                );
                button.type = "button";
                button.dataset.action = "transition";
                button.dataset.applicationId = application.id;
                button.dataset.status = status;
                button.dataset.jobId = jobId;
                actions.append(button);
            });
            if (application.can_rate) {
                const rate = element("button", "button button-primary button-small", "Rate worker");
                rate.type = "button";
                rate.dataset.action = "rate";
                rate.dataset.applicationId = application.id;
                rate.dataset.jobId = jobId;
                actions.append(rate);
            } else if (application.has_rated) {
                actions.append(element("span", "status-tag", "Rating submitted"));
            }
            if (actions.childElementCount) item.append(actions);
            container.append(item);
        });
    }

    async function transitionApplication(applicationId, status, jobId = "") {
        await request(`/api/applications/${applicationId}/status/`, {
            method: "PATCH",
            body: {status},
        });
        showFlash(`Application moved to ${humanize(status)}.`);
        if (state.user.role === "WORKER") await loadWorkerApplications();
        else if (jobId) await loadEmployerApplications(jobId);
    }

    async function rateApplication(applicationId, triggerButton, jobId = "") {
        const scoreText = window.prompt("Rating from 1 to 5:", "5");
        if (scoreText === null) return;
        const score = Number(scoreText);
        if (!Number.isInteger(score) || score < 1 || score > 5) {
            showFlash("Rating must be a whole number from 1 to 5.", "error");
            return;
        }
        const reviewText = window.prompt("Optional review:", "") ?? "";
        await request(`/api/applications/${applicationId}/rating/`, {
            method: "POST",
            body: {score, review_text: reviewText},
        });
        if (triggerButton) triggerButton.remove();
        await loadRatingSummary();
        if (state.user.role === "WORKER") {
            await loadWorkerApplications();
        } else if (jobId) {
            await loadEmployerApplications(jobId);
        }
        showFlash("Rating submitted.");
    }

    function scoreBreakdown(result) {
        const breakdown = element("div", "score-breakdown");
        [
            ["Skills", result.skill?.skill_score],
            ["Distance", result.distance_score],
            ["Experience", result.experience_score],
            ["Available", result.availability_preference_score],
            ["Reliable", result.reliability_verification_score],
            ["Mutual fit", result.reciprocal_preference_score],
        ].forEach(([label, score]) => {
            const cell = element("span");
            cell.append(
                element("strong", "", score === null || score === undefined ? "—" : Number(score).toFixed(1)),
                document.createTextNode(label),
            );
            breakdown.append(cell);
        });
        return breakdown;
    }

    function recommendationCard(result, type) {
        const subject = type === "job" ? result.job : result.worker;
        const card = element("article", "recommendation-card");
        const top = element("div", "score-row");
        const heading = element("div");
        const workerDistance = result.distance_km === null || result.distance_km === undefined
            ? "Distance unavailable"
            : `${Number(result.distance_km).toFixed(1)} km from job`;
        heading.append(
            element("h4", "", type === "job" ? subject.title : subject.username),
            element(
                "p",
                "",
                type === "job"
                    ? `${subject.employer_name} · ${subject.subcategory_name}`
                    : `${subject.experience_years} year(s) · ${workerDistance}`,
            ),
        );
        top.append(heading, element("span", "score-ring", Number(result.final_score).toFixed(1)));
        card.append(top, scoreBreakdown(result));

        if (result.skill?.missing_required_skills?.length) {
            const missing = element(
                "p",
                "",
                `Missing: ${result.skill.missing_required_skills.map((skill) => skill.name).join(", ")}`,
            );
            card.append(missing);
        }

        const reasons = element("ul", "reason-list");
        (result.reasons || []).forEach((reason) => reasons.append(element("li", "", reason)));
        card.append(reasons);

        if (result.warnings?.length) {
            const warningGroup = element("div", "warning-group");
            warningGroup.append(element("strong", "", "Match cautions"));
            const warnings = element("ul", "warning-list");
            result.warnings.forEach((warning) => warnings.append(element("li", "", warning)));
            warningGroup.append(warnings);
            card.append(warningGroup);
        }

        if (type === "job") {
            const apply = element("button", "button button-primary button-small", "Apply");
            apply.type = "button";
            apply.dataset.action = "apply";
            apply.dataset.jobId = subject.id;
            card.append(apply);
        }
        return card;
    }

    async function loadWorkerRecommendations() {
        const results = await request("/api/recommendations/jobs/");
        const section = byId("worker-recommendation-results");
        const container = section.querySelector(".card-grid");
        container.replaceChildren();
        section.hidden = false;
        if (!results.length) container.append(element("div", "empty-state", "No eligible jobs are available."));
        else results.forEach((result) => container.append(recommendationCard(result, "job")));
        section.scrollIntoView({behavior: "smooth", block: "start"});
    }

    async function loadEmployerRecommendations(jobId) {
        const results = await request(`/api/recommendations/jobs/${jobId}/workers/`);
        const section = byId("employer-recommendation-results");
        const container = section.querySelector(".card-grid");
        container.replaceChildren();
        section.hidden = false;
        if (!results.length) container.append(element("div", "empty-state", "No eligible workers are available."));
        else results.forEach((result) => container.append(recommendationCard(result, "worker")));
        section.scrollIntoView({behavior: "smooth", block: "start"});
    }

    async function loadAdvisory() {
        const advisory = await request("/api/recommendations/opportunities/");
        const section = byId("advisory-results");
        const container = section.querySelector(".advisory-grid");
        container.replaceChildren();
        section.hidden = false;

        const skillsColumn = element("article", "advisory-column");
        skillsColumn.append(element("h4", "", "Skills that unlock near-miss jobs"));
        if (!advisory.missing_skills.length) {
            skillsColumn.append(element("div", "empty-state", "No missing skills to suggest right now."));
        } else {
            advisory.missing_skills.forEach((advice) => {
                const row = element("div", "skill-advice");
                const copy = element("div", "skill-advice-copy");
                copy.append(
                    element("strong", "", advice.skill.name),
                    element("p", "", advice.reason),
                );
                row.append(
                    copy,
                    element("span", "", `${advice.missing_frequency} near-miss job(s)`),
                );
                skillsColumn.append(row);
            });
        }

        const jobsColumn = element("article", "advisory-column");
        jobsColumn.append(element("h4", "", "Reachable opportunities"));
        const jobs = element("div", "card-grid");
        if (!advisory.near_miss_jobs.length) {
            jobs.append(element("div", "empty-state", "No jobs fall in the configured near-miss range."));
        } else {
            advisory.near_miss_jobs.forEach((result) => jobs.append(recommendationCard(result, "job")));
        }
        jobsColumn.append(jobs);
        container.append(skillsColumn, jobsColumn);
        section.scrollIntoView({behavior: "smooth", block: "start"});
    }

    async function previewCv() {
        const previewWindow = window.open("", "_blank");
        try {
            const html = await request("/api/profiles/worker/me/cv/preview/", {responseType: "text"});
            const url = URL.createObjectURL(new Blob([html], {type: "text/html"}));
            if (previewWindow) previewWindow.location.href = url;
            else showFlash("Allow pop-ups to preview the CV.", "error");
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) {
            if (previewWindow) previewWindow.close();
            throw error;
        }
    }

    async function downloadCv() {
        const blob = await request("/api/profiles/worker/me/cv/pdf/", {responseType: "blob"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `workforce_matching-cv-${state.user.username}.pdf`;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function bindEvents() {
        byId("register-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            await runBusy(form, async () => {
                const credentials = {
                    username: form.elements.username.value.trim(),
                    password: form.elements.password.value,
                };
                await request("/api/auth/register/", {
                    method: "POST",
                    body: {
                        ...credentials,
                        email: form.elements.email.value.trim(),
                        phone_number: form.elements.phone_number.value.trim(),
                        role: form.elements.role.value,
                    },
                    auth: false,
                });
                await signIn(credentials.username, credentials.password);
                form.reset();
                showFlash("Account created. Complete your profile to improve matching.");
                byId("profile").scrollIntoView({behavior: "smooth"});
            }).catch(() => {});
        });

        byId("login-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            await runBusy(form, async () => {
                await signIn(form.elements.username.value.trim(), form.elements.password.value);
                form.reset();
                showFlash("Signed in.");
            }).catch(() => {});
        });

        byId("logout-button").addEventListener("click", async (event) => {
            await runBusy(event.currentTarget, async () => {
                try {
                    if (state.refresh) {
                        await request("/api/auth/logout/", {
                            method: "POST",
                            body: {refresh: state.refresh},
                        });
                    }
                } finally {
                    clearSession();
                    renderSession();
                    byId("worker-application-list").replaceChildren();
                    byId("employer-job-list").replaceChildren();
                    await loadPublicJobs();
                }
                showFlash("Signed out.");
            }).catch(() => {});
        });

        byId("worker-profile-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            await runBusy(event.currentTarget, () => saveWorkerProfile(event.currentTarget)).catch(() => {});
        });

        byId("employer-profile-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            await runBusy(event.currentTarget, () => saveEmployerProfile(event.currentTarget)).catch(() => {});
        });

        byId("job-filter-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            await runBusy(event.currentTarget, loadPublicJobs).catch(() => {});
        });

        byId("job-filter-category").addEventListener("change", () => {
            populateSubcategorySelect(
                byId("job-filter-category"),
                byId("job-filter-subcategory"),
                "All subcategories",
            );
        });
        byId("job-category").addEventListener("change", () => {
            populateSubcategorySelect(byId("job-category"), byId("job-subcategory"), "Choose subcategory");
        });

        byId("job-create-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            await runBusy(event.currentTarget, () => createJob(event.currentTarget)).catch(() => {});
        });

        byId("load-worker-recommendations").addEventListener("click", async (event) => {
            await runBusy(event.currentTarget, loadWorkerRecommendations).catch(() => {});
        });
        byId("load-advisory").addEventListener("click", async (event) => {
            await runBusy(event.currentTarget, loadAdvisory).catch(() => {});
        });
        byId("preview-cv").addEventListener("click", async (event) => {
            await runBusy(event.currentTarget, previewCv).catch(() => {});
        });
        byId("download-cv").addEventListener("click", async (event) => {
            await runBusy(event.currentTarget, downloadCv).catch(() => {});
        });

        document.body.addEventListener("click", async (event) => {
            const button = event.target.closest("[data-action]");
            if (!button) return;
            const {action, jobId, applicationId, status} = button.dataset;

            await runBusy(button, async () => {
                if (action === "apply") await applyToJob(jobId);
                else if (action === "close-job") await closeJob(jobId);
                else if (action === "applications") await loadEmployerApplications(jobId);
                else if (action === "recommend-workers") await loadEmployerRecommendations(jobId);
                else if (action === "transition") {
                    await transitionApplication(applicationId, status, jobId);
                } else if (action === "rate") {
                    await rateApplication(applicationId, button, jobId);
                }
            }).catch(() => {});
        });
    }

    async function start() {
        bindEvents();
        renderSession();
        const results = await Promise.allSettled([loadTaxonomy(), loadPublicJobs(), restoreSession()]);
        const failure = results.find((result) => result.status === "rejected");
        if (failure) showFlash(failure.reason.message || "The demo data could not be loaded.", "error");
    }

    start();
})();
