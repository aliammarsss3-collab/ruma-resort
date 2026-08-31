/* منتجع رُومة — shared frontend behaviour */
(function () {
  "use strict";

  const API_BASE_URL = (window.RUMA_CONFIG && window.RUMA_CONFIG.API_BASE_URL) || "";
  let bookingPricing = {
    morning_price: 200000,
    evening_price: 250000,
    included_guests: 15,
    extra_guest_price: 10000,
    mahr_price: 1000000,
    wedding_price: 1000000,
    circumcision_price: 750000,
    birthday_price: 750000,
    event_hours: "من 10 صباحاً إلى 8 صباح اليوم التالي",
  };

  /* ---------------------------- Sticky nav + toggle ---------------------------- */
  function initNav() {
    const header = document.querySelector(".site-header");
    const toggle = document.querySelector(".nav-toggle");
    const links = document.querySelector(".nav-links");

    if (header) {
      const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 30);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    if (toggle && links) {
      toggle.addEventListener("click", () => links.classList.toggle("open"));
      links.querySelectorAll("a").forEach((a) =>
        a.addEventListener("click", () => links.classList.remove("open"))
      );
    }
  }

  /* --------------------------------- Reveal on scroll --------------------------------- */
  function initReveal() {
    const items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    items.forEach((el) => observer.observe(el));
  }

  /* ------------------------------- Load public settings ------------------------------- */
  function formatIQD(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return value;
    return n.toLocaleString("ar-IQ");
  }

  function updateBookingPrice() {
    const form = document.querySelector("#booking-form");
    const box = document.querySelector("[data-booking-price]");
    if (!form || !box) return;
    const shift = form.shift.value;
    const bookingType = form.booking_type ? form.booking_type.value : "stay";
    const guests = Math.max(1, Number(form.guests_count.value) || 1);
    const strong = box.querySelector("strong");
    const small = box.querySelector("small");
    if (bookingType === "stay" && !shift) {
      strong.textContent = "اختر الشفت وعدد الأشخاص";
      return;
    }
    const eventType = bookingType !== "stay";
    const base = Number(bookingPricing[eventType ? bookingType + "_price" : shift + "_price"]) || 0;
    const included = Number(bookingPricing.included_guests) || 15;
    const extraPrice = Number(bookingPricing.extra_guest_price) || 10000;
    const extras = eventType ? 0 : Math.max(0, guests - included);
    const total = base + extras * extraPrice;
    strong.textContent = formatIQD(total) + " دينار عراقي";
    small.textContent = eventType
      ? "سعر ثابت للمناسبة حسب العدد المحدد، من 10 صباحاً إلى 8 صباح اليوم التالي."
      : extras
      ? `يشمل السعر ${included} شخصاً + ${formatIQD(extras * extraPrice)} دينار للأشخاص الإضافيين.`
      : `السعر الأساسي يشمل لغاية ${included} شخصاً.`;
    const deposit = document.querySelector("[data-deposit-amount]");
    if (deposit) deposit.textContent = formatIQD(Math.floor(total / 2)) + " دينار عراقي";
  }

  function updateBookingType() {
    const form = document.querySelector("#booking-form");
    if (!form || !form.booking_type) return;
    const type = form.booking_type.value;
    const ranges = {
      stay: [1, 100],
      mahr: [100, 150],
      wedding: [100, 150],
      circumcision: [50, 60],
      birthday: [50, 60],
    };
    const [minimum, maximum] = ranges[type] || ranges.stay;
    form.guests_count.min = minimum;
    form.guests_count.max = maximum;
    if (Number(form.guests_count.value) < minimum || Number(form.guests_count.value) > maximum) {
      form.guests_count.value = minimum;
    }
    const isEvent = type !== "stay";
    const shiftField = form.querySelector("[data-shift-field]");
    const notice = document.querySelector("[data-event-notice]");
    if (shiftField) shiftField.hidden = isEvent;
    form.shift.required = !isEvent;
    if (isEvent) form.shift.value = "";
    if (notice) notice.hidden = !isEvent;
    updateBookingPrice();
  }

  function initBookingPricing() {
    const form = document.querySelector("#booking-form");
    if (!form) return;
    form.shift.addEventListener("change", updateBookingPrice);
    form.guests_count.addEventListener("input", updateBookingPrice);
    if (form.booking_type) form.booking_type.addEventListener("change", updateBookingType);
    updateBookingType();
  }

  async function loadSettings() {
    const targets = document.querySelectorAll("[data-setting]");
    const priceTargets = document.querySelectorAll("[data-price]");
    const serviceList = document.querySelector("[data-services]");
    const termsList = document.querySelector("[data-terms]");
    const bookingPrice = document.querySelector("[data-booking-price]");
    if (!targets.length && !priceTargets.length && !serviceList && !termsList && !bookingPrice) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/settings`);
      const data = await res.json();
      if (!data.success) return;
      const s = data.settings;
      bookingPricing = { ...bookingPricing, ...s };
      updateBookingPrice();

      const eventHours = document.querySelector("[data-event-hours]");
      if (eventHours && s.event_hours) eventHours.textContent = s.event_hours;
      const instructions = document.querySelector("[data-payment-instructions]");
      if (instructions && s.payment_instructions) instructions.textContent = s.payment_instructions;
      const methods = document.querySelector("[data-payment-methods]");
      if (methods && Array.isArray(s.payment_methods) && s.payment_methods.length) {
        methods.innerHTML = '<option value="">اختر طريقة الدفع</option>';
        s.payment_methods.forEach((method) => {
          const option = document.createElement("option");
          option.value = method;
          option.textContent = method;
          methods.appendChild(option);
        });
      }

      targets.forEach((el) => {
        const key = el.getAttribute("data-setting");
        if (s[key]) el.textContent = s[key];
      });

      priceTargets.forEach((el) => {
        const key = el.getAttribute("data-price");
        if (s[key]) el.textContent = formatIQD(s[key]);
      });

      if (serviceList && Array.isArray(s.services) && s.services.length) {
        serviceList.innerHTML = "";
        const icons = ["🏊", "🌿", "🛋️", "🔒", "🚗", "🧹", "✨", "🌙"];
        s.services.forEach((service, i) => {
          const card = document.createElement("div");
          card.className = "service-card reveal";
          card.innerHTML = `<div class="dot">${icons[i % icons.length]}</div><h3>${service}</h3>`;
          serviceList.appendChild(card);
        });
        initReveal();
      }

      if (termsList && Array.isArray(s.terms) && s.terms.length) {
        termsList.innerHTML = "";
        s.terms.forEach((term) => {
          const item = document.createElement("li");
          item.textContent = term;
          termsList.appendChild(item);
        });
      }

      const mapQuery = s.map_location || s.address;
      if (mapQuery) {
        const encoded = encodeURIComponent(mapQuery);
        const frame = document.querySelector("[data-map-frame]");
        const link = document.querySelector("[data-map-link]");
        if (frame) frame.src = "https://www.google.com/maps?q=" + encoded + "&output=embed";
        if (link) link.href = "https://www.google.com/maps/search/?api=1&query=" + encoded;
      }
    } catch (err) {
      // Backend not reachable yet (e.g. before deployment) — fail silently,
      // the page still works with its static default content.
      console.warn("تعذر تحميل الإعدادات من الخادم:", err);
    }
  }

  /* -------------------------------- Load public gallery -------------------------------- */
  async function loadGallery() {
    const grid = document.querySelector("[data-gallery]");
    if (!grid) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/gallery`);
      const data = await res.json();
      if (!data.success) return;

      if (!data.images.length) {
        return;
      }

      grid.innerHTML = "";
      data.images.forEach((img) => {
        const fig = document.createElement("figure");
        fig.innerHTML = `<img src="${img.url}" alt="${img.caption || "منتجع رُومة"}" loading="lazy">`;
        grid.appendChild(fig);
      });
    } catch (err) {
      if (!grid.querySelector("figure")) {
        grid.innerHTML = '<p class="gallery-empty">سيتم إضافة صور المعرض قريباً.</p>';
      }
      console.warn("تعذر تحميل معرض الصور:", err);
    }
  }

  /* ----------------------------------- Booking form ----------------------------------- */
  function showAlert(box, type, message) {
    box.className = `alert alert-${type} show`;
    box.textContent = message;
  }

  function initBookingForm() {
    const form = document.querySelector("#booking-form");
    if (!form) return;

    const alertBox = form.parentElement.querySelector(".alert");
    const submitBtn = form.querySelector('button[type="submit"]');
    const resultBox = document.querySelector("#booking-result");

    // Prevent selecting a past date in the date picker itself.
    const dateInput = form.querySelector('input[name="booking_date"]');
    if (dateInput) {
      const today = new Date().toISOString().slice(0, 10);
      dateInput.setAttribute("min", today);
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      alertBox.classList.remove("show");
      form.querySelectorAll(".field-error").forEach((el) => el.classList.remove("show"));

      const payload = new FormData(form);

      submitBtn.disabled = true;
      submitBtn.textContent = "جارٍ الإرسال...";

      try {
        const res = await fetch(`${API_BASE_URL}/api/bookings`, {
          method: "POST",
          body: payload,
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          if (data.field) {
            const fieldError = form.querySelector(`[data-error-for="${data.field}"]`);
            if (fieldError) {
              fieldError.textContent = data.error;
              fieldError.classList.add("show");
            }
          }
          showAlert(alertBox, "danger", data.error || "حدث خطأ أثناء إرسال الحجز، الرجاء المحاولة مجدداً.");
          return;
        }

        form.reset();
        updateBookingType();
        showAlert(alertBox, "success", "تم استلام طلب الحجز بنجاح! سنتواصل معكم لتأكيد الحجز.");
        if (resultBox) {
          resultBox.hidden = false;
          resultBox.querySelector("[data-booking-id]").textContent = data.booking.booking_id;
          const total = resultBox.querySelector("[data-booking-total]");
          if (total) total.textContent = formatIQD(data.booking.total_price);
          const deposit = resultBox.querySelector("[data-booking-deposit]");
          if (deposit) deposit.textContent = formatIQD(data.booking.deposit_amount);
        }
      } catch (err) {
        showAlert(
          alertBox,
          "danger",
          "تعذر الاتصال بالخادم. تأكد من ضبط عنوان الخادم (API_BASE_URL) في ملف js/config.js."
        );
        console.error(err);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "إرسال الطلب وإثبات الدفع";
      }
    });
  }

  /* ------------------------------- Booking status check -------------------------------- */
  function initStatusCheck() {
    const form = document.querySelector("#status-form");
    if (!form) return;
    const resultBox = document.querySelector("#status-result");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const bookingId = form.booking_id.value.trim();
      const phone = form.phone.value.trim();

      resultBox.className = "alert show alert-success";
      resultBox.textContent = "جارٍ البحث...";

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/bookings/${encodeURIComponent(bookingId)}?phone=${encodeURIComponent(phone)}`
        );
        const data = await res.json();

        if (!res.ok || !data.success) {
          resultBox.className = "alert show alert-danger";
          resultBox.textContent = data.error || "لم يتم العثور على الحجز.";
          return;
        }

        resultBox.className = "alert show alert-success";
        resultBox.innerHTML = `رقم الحجز <strong>${data.booking.booking_id}</strong> — الحالة الحالية: <strong>${data.booking.status_label}</strong>`;
      } catch (err) {
        resultBox.className = "alert show alert-danger";
        resultBox.textContent = "تعذر الاتصال بالخادم.";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initNav();
    initReveal();
    initBookingPricing();
    loadSettings();
    loadGallery();
    initBookingForm();
    initStatusCheck();

    const yearEl = document.querySelector("[data-year]");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  });
})();
