"""Public JSON API consumed by the static frontend.

No authentication is required here on purpose: these are the endpoints
the GitHub Pages frontend calls directly from the browser. Keep this
blueprint limited to safe, read-only data plus booking creation.
"""
from datetime import datetime, date

import os
import uuid

from flask import Blueprint, jsonify, request, current_app
from werkzeug.utils import secure_filename

from extensions import db
from models import Booking, Setting, GalleryImage, generate_booking_id

api_bp = Blueprint("api", __name__)

PUBLIC_SETTING_KEYS = [
    "resort_name_ar",
    "resort_tagline",
    "about_text",
    "morning_price",
    "evening_price",
    "morning_hours",
    "evening_hours",
    "included_guests",
    "extra_guest_price",
    "mahr_price",
    "wedding_price",
    "circumcision_price",
    "birthday_price",
    "event_hours",
    "payment_methods",
    "payment_instructions",
    "phone",
    "whatsapp",
    "address",
    "map_location",
    "terms",
    "services",
]


@api_bp.get("/health")
def health():
    return jsonify(success=True, status="ok")


@api_bp.get("/settings")
def get_settings():
    values = Setting.get_many(PUBLIC_SETTING_KEYS)
    services_raw = values.get("services", "")
    values["services"] = [s for s in services_raw.split("|") if s.strip()]
    terms_raw = values.get("terms", "")
    values["terms"] = [term for term in terms_raw.split("|") if term.strip()]
    payment_methods_raw = values.get("payment_methods", "")
    values["payment_methods"] = [item for item in payment_methods_raw.split("|") if item.strip()]
    return jsonify(success=True, settings=values)


@api_bp.get("/gallery")
def get_gallery():
    base_url = request.url_root.rstrip("/")
    images = GalleryImage.query.order_by(GalleryImage.uploaded_at.desc()).all()
    return jsonify(success=True, images=[img.to_dict(base_url) for img in images])


def _error(message, field=None, status=400):
    payload = {"success": False, "error": message}
    if field:
        payload["field"] = field
    return jsonify(payload), status


@api_bp.post("/bookings")
def create_booking():
    data = request.get_json(silent=True) or request.form

    full_name = (data.get("full_name") or "").strip()
    phone = (data.get("phone") or "").strip()
    booking_date_raw = (data.get("booking_date") or "").strip()
    shift = (data.get("shift") or "").strip()
    booking_type = (data.get("booking_type") or "stay").strip()
    guests_count_raw = str(data.get("guests_count") or "").strip()
    notes = (data.get("notes") or "").strip()
    payment_method = (data.get("payment_method") or "").strip()
    payment_proof = request.files.get("payment_proof")

    if not full_name or len(full_name) < 2:
        return _error("الرجاء إدخال الاسم الكامل.", "full_name")
    if len(full_name) > 120:
        return _error("الاسم طويل جداً.", "full_name")

    if not phone or len(phone) < 7 or not any(ch.isdigit() for ch in phone):
        return _error("الرجاء إدخال رقم هاتف صحيح.", "phone")
    if len(phone) > 30:
        return _error("رقم الهاتف طويل جداً.", "phone")

    event_types = {"mahr", "circumcision", "birthday", "wedding"}
    if booking_type not in ({"stay"} | event_types):
        return _error("نوع الحجز غير صحيح.", "booking_type")
    if booking_type == "stay" and shift not in ("morning", "evening"):
        return _error("الرجاء اختيار نوع الشفت.", "shift")
    if booking_type in event_types:
        shift = "event"

    try:
        booking_date = datetime.strptime(booking_date_raw, "%Y-%m-%d").date()
    except ValueError:
        return _error("تاريخ الحجز غير صحيح.", "booking_date")
    if booking_date < date.today():
        return _error("لا يمكن اختيار تاريخ في الماضي.", "booking_date")

    try:
        guests_count = int(guests_count_raw)
    except ValueError:
        return _error("عدد الأشخاص غير صحيح.", "guests_count")
    guest_ranges = {"mahr": (100, 150), "wedding": (100, 150), "circumcision": (50, 60), "birthday": (50, 60)}
    minimum, maximum = guest_ranges.get(booking_type, (1, 100))
    if guests_count < minimum or guests_count > maximum:
        return _error(f"عدد الأشخاص لهذا الحجز يجب أن يكون بين {minimum} و {maximum}.", "guests_count")

    if len(notes) > 1000:
        return _error("الملاحظات طويلة جداً.", "notes")

    payment_methods = [item.strip() for item in Setting.get("payment_methods", "").split("|") if item.strip()]
    if not payment_method or payment_method not in payment_methods:
        return _error("الرجاء اختيار طريقة الدفع.", "payment_method")
    if payment_proof is None or not payment_proof.filename:
        return _error("الرجاء رفع صورة إثبات دفع العربون.", "payment_proof")
    extension = secure_filename(payment_proof.filename).rsplit(".", 1)[-1].lower() if "." in payment_proof.filename else ""
    if extension not in current_app.config["ALLOWED_IMAGE_EXTENSIONS"]:
        return _error("صيغة إثبات الدفع غير مدعومة. استخدم JPG أو PNG أو WEBP.", "payment_proof")
    proof_filename = f"{uuid.uuid4().hex}.{extension}"
    payment_proof.save(os.path.join(current_app.config["PAYMENT_UPLOAD_FOLDER"], proof_filename))

    if booking_type == "stay":
        total_price = (
            int(Setting.get("morning_price" if shift == "morning" else "evening_price", "0"))
            + max(0, guests_count - int(Setting.get("included_guests", "15")))
            * int(Setting.get("extra_guest_price", "10000"))
        )
    else:
        total_price = int(Setting.get(f"{booking_type}_price", "0"))

    booking = Booking(
        booking_id=generate_booking_id(),
        full_name=full_name,
        phone=phone,
        booking_date=booking_date,
        shift=shift,
        booking_type=booking_type,
        guests_count=guests_count,
        notes=notes,
        total_price=total_price,
        deposit_amount=total_price // 2,
        payment_method=payment_method,
        payment_proof=proof_filename,
        status="new",
    )
    db.session.add(booking)
    db.session.commit()

    return jsonify(success=True, booking=booking.to_public_dict()), 201


@api_bp.get("/bookings/<booking_id>")
def check_booking_status(booking_id):
    """Let a guest check their booking status using booking_id + phone."""
    phone = (request.args.get("phone") or "").strip()
    if not phone:
        return _error("الرجاء إدخال رقم الهاتف المستخدم عند الحجز.", "phone")

    booking = Booking.query.filter_by(booking_id=booking_id.strip().upper()).first()
    if booking is None or booking.phone != phone:
        return _error("لم يتم العثور على حجز مطابق لهذه البيانات.", status=404)

    return jsonify(success=True, booking=booking.to_public_dict())
