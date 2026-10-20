import { useEffect, useRef, useState } from "react";
import {
    CircleAlert,
    CircleCheck,
    ClipboardPen,
    Info,
    LoaderCircle,
    MessageCircle,
    Send,
    X
} from "lucide-react";

import {
    CIUDAD_PASTEL_WHATSAPP,
    ID_TYPES,
    formatPhone,
    whatsappLink
} from "../../constants/enrollment";
import { submitEnrollmentRequest } from "../../services/enrollmentRequests.service";
import {
    EMPTY_ENROLLMENT_FORM,
    ENROLLMENT_LIMITS,
    mapEnrollmentApiErrors,
    onlyDigits,
    toEnrollmentPayload,
    validateEnrollmentForm
} from "../../utils/enrollmentValidation";

import styles from "./EnrollmentRequest.module.css";

const FIELD_ORDER = ["fullName", "idNumber", "phone"];

/**
 * Solicitud de matrícula de un curso publicado (HU-A05).
 * Enviarla no matricula a la persona: Ciudad Pastel la contacta y el pago
 * se coordina fuera de la plataforma.
 *   course: curso publicado (id y name)
 *   open / onOpenChange(abierto): la página controla si el formulario está abierto,
 *     así el botón "Solicitar matrícula" de arriba también lo puede abrir
 */
function EnrollmentRequest({ course, open, onOpenChange }) {
    // Resultado del envío: form -> sent | duplicate
    const [result, setResult] = useState("form");
    const step = open ? result : "closed";
    const [values, setValues] = useState(EMPTY_ENROLLMENT_FORM);
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [serverError, setServerError] = useState("");
    const [sentPhone, setSentPhone] = useState("");

    const idType = ID_TYPES.find((type) => type.value === values.idType);

    const sectionRef = useRef(null);
    const formRef = useRef(null);

    const questionsLink = whatsappLink(
        CIUDAD_PASTEL_WHATSAPP,
        `Hola, tengo una consulta sobre el curso "${course.name}".`
    );

    // Al abrir el formulario se trae a la vista y el cursor queda en el primer campo
    useEffect(() => {
        if (step !== "form") return;
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        formRef.current?.elements.namedItem("fullName")?.focus({ preventScroll: true });
    }, [step]);

    function update(name, value) {
        const next = { ...values, [name]: value };
        setValues(next);
        setErrors(validateEnrollmentForm(next));
    }

    function handleChange(event) {
        const { name, value } = event.target;
        // En cédula y teléfono solo quedan los números (si se pega "2-0538-0021" queda "205380021")
        if (name === "idNumber") update(name, onlyDigits(value).slice(0, idType.maxDigits));
        else if (name === "phone") update(name, onlyDigits(value).slice(0, 8));
        else update(name, value);
    }

    function handleBlur(event) {
        setTouched((prev) => ({ ...prev, [event.target.name]: true }));
        setErrors(validateEnrollmentForm(values));
    }

    function changeIdType(idType) {
        update("idType", idType);
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setServerError("");

        const validationErrors = validateEnrollmentForm(values);
        setErrors(validationErrors);
        setTouched(Object.fromEntries(FIELD_ORDER.map((field) => [field, true])));

        const firstInvalid = FIELD_ORDER.find((field) => validationErrors[field]);
        if (firstInvalid) {
            formRef.current?.elements.namedItem(firstInvalid)?.focus();
            return;
        }

        setSubmitting(true);
        const payload = toEnrollmentPayload(values);

        try {
            await submitEnrollmentRequest(course.id, payload);
            setSentPhone(payload.phone);
            setResult("sent");
        } catch (error) {
            if (error.status === 409) {
                setResult("duplicate");
            } else if (error.status === 429) {
                setServerError("Se enviaron varias solicitudes seguidas desde esta conexión. Espera unos minutos e intenta de nuevo.");
            } else if (error.status === 404) {
                setServerError("Este curso ya no está recibiendo solicitudes. Escríbenos por WhatsApp para más información.");
            } else if (error.status === 400) {
                const fieldErrors = mapEnrollmentApiErrors(error.details);
                setErrors((prev) => ({ ...prev, ...fieldErrors }));
                setTouched((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(fieldErrors).map((f) => [f, true])) }));
                setServerError("Revisa los datos marcados e intenta de nuevo.");
            } else {
                setServerError(error.message || "No se pudo enviar la solicitud. Intenta de nuevo.");
            }
        } finally {
            setSubmitting(false);
        }
    }

    function fieldProps(name) {
        const showError = touched[name] && errors[name];
        return {
            id: `enroll-${name}`,
            name,
            value: values[name],
            onChange: handleChange,
            onBlur: handleBlur,
            disabled: submitting,
            "aria-invalid": showError ? true : undefined,
            "aria-describedby": `enroll-${name}-hint enroll-${name}-error`
        };
    }

    function messages(name, hint) {
        return (
            <>
                {hint && <p id={`enroll-${name}-hint`} className={styles.hint}>{hint}</p>}
                {touched[name] && errors[name] && (
                    <p id={`enroll-${name}-error`} className={styles.fieldError}>
                        <CircleAlert size={14} aria-hidden="true" />
                        {errors[name]}
                    </p>
                )}
            </>
        );
    }

    const whatsappButton = (
        <a href={questionsLink} target="_blank" rel="noreferrer" className={`btn btn-secondary ${styles.whatsapp}`}>
            <MessageCircle size={18} aria-hidden="true" />
            ¿Dudas? Escríbenos por WhatsApp
        </a>
    );

    return (
        <section ref={sectionRef} className={styles.card} aria-labelledby="enroll-title" id="solicitar-matricula">
            {step === "closed" && course.remainingSpots === 0 && (
                <div className={styles.invite}>
                    <div>
                        <h2 id="enroll-title">Este curso ya no tiene cupos</h2>
                        <p>
                            Escríbenos por WhatsApp para saber si se abre otro grupo o si se libera
                            algún espacio.
                        </p>
                    </div>
                    <div className={styles.actions}>{whatsappButton}</div>
                </div>
            )}

            {step === "closed" && course.remainingSpots !== 0 && (
                <div className={styles.invite}>
                    <div>
                        <h2 id="enroll-title">¿Te interesa este curso?</h2>
                        <p>
                            Envía tu solicitud y Ciudad Pastel te contactará para coordinar el pago
                            y confirmar tu matrícula.
                        </p>
                    </div>
                    <div className={styles.actions}>
                        <button type="button" className="btn btn-primary" onClick={() => onOpenChange(true)}>
                            <ClipboardPen size={18} aria-hidden="true" />
                            Solicitar matrícula
                        </button>
                        {whatsappButton}
                    </div>
                </div>
            )}

            {step === "form" && (
                <form ref={formRef} onSubmit={handleSubmit} noValidate className={styles.form}>
                    <header className={styles.formHeader}>
                        <div>
                            <h2 id="enroll-title">Solicitar matrícula</h2>
                            <p className={styles.course}>
                                Curso: <strong>{course.name}</strong>
                            </p>
                        </div>
                        <button
                            type="button"
                            className={styles.close}
                            onClick={() => onOpenChange(false)}
                            disabled={submitting}
                            aria-label="Cerrar el formulario"
                            title="Cerrar el formulario"
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </header>

                    <p className={styles.required}>Todos los campos son obligatorios.</p>

                    {serverError && (
                        <p role="alert" className={styles.serverError}>
                            <CircleAlert size={18} aria-hidden="true" />
                            {serverError}
                        </p>
                    )}

                    <div className={styles.field}>
                        <label htmlFor="enroll-fullName">Nombre completo</label>
                        <input
                            type="text"
                            autoComplete="name"
                            maxLength={ENROLLMENT_LIMITS.fullName.max}
                            placeholder="Ej.: Ana Mora Jiménez"
                            {...fieldProps("fullName")}
                        />
                        {messages("fullName", "Tal como aparecerá en tu certificado.")}
                    </div>

                    <div className={styles.field}>
                        <span id="enroll-idType-label" className={styles.label}>Tipo de documento</span>
                        <div role="radiogroup" aria-labelledby="enroll-idType-label" className={styles.choices}>
                            {ID_TYPES.map((type) => (
                                <label
                                    key={type.value}
                                    className={`${styles.choice} ${values.idType === type.value ? styles.choiceActive : ""}`}
                                >
                                    <input
                                        type="radio"
                                        name="idType"
                                        value={type.value}
                                        checked={values.idType === type.value}
                                        onChange={() => changeIdType(type.value)}
                                        disabled={submitting}
                                    />
                                    {type.label}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="enroll-idNumber">Número de {idType.short === "DIMEX" ? "DIMEX" : "cédula"}</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder={idType.value === "dimex" ? "Ej.: 155123456789" : "Ej.: 105380021"}
                            {...fieldProps("idNumber")}
                        />
                        {messages("idNumber", idType.hint)}
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="enroll-phone">Teléfono</label>
                        <input
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel-national"
                            placeholder="Ej.: 88887777"
                            {...fieldProps("phone")}
                        />
                        {messages("phone", "8 dígitos. Te contactaremos aquí y te agregaremos al grupo de WhatsApp del curso.")}
                    </div>

                    <p className={styles.note}>
                        <Info size={16} aria-hidden="true" />
                        <span>
                            Enviar la solicitud <strong>no reserva el cupo</strong> todavía: el pago se
                            coordina con Ciudad Pastel (por ejemplo, por SINPE Móvil).
                        </span>
                    </p>

                    <div className={styles.actions}>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={submitting}
                            // Evita que el clic falle si aparece un mensaje de error al salir del campo
                            onMouseDown={(event) => event.preventDefault()}
                        >
                            {submitting
                                ? <LoaderCircle size={18} className={styles.spin} aria-hidden="true" />
                                : <Send size={18} aria-hidden="true" />}
                            {submitting ? "Enviando…" : "Enviar solicitud"}
                        </button>
                        {whatsappButton}
                    </div>
                </form>
            )}

            {step === "sent" && (
                <div className={styles.result} role="status">
                    <CircleCheck size={32} aria-hidden="true" className={styles.resultIcon} />
                    <div>
                        <h2 id="enroll-title">¡Recibimos tu solicitud!</h2>
                        <p>
                            Ciudad Pastel te contactará al <strong>{formatPhone(sentPhone)}</strong> para
                            coordinar el pago y confirmar tu matrícula en <strong>{course.name}</strong>.
                        </p>
                        <p className={styles.muted}>
                            Tu cupo queda confirmado cuando se complete el pago, que se coordina fuera
                            de esta página (por ejemplo, por SINPE Móvil).
                        </p>
                        <div className={styles.actions}>{whatsappButton}</div>
                    </div>
                </div>
            )}

            {step === "duplicate" && (
                <div className={`${styles.result} ${styles.resultInfo}`} role="status">
                    <Info size={32} aria-hidden="true" className={styles.resultIcon} />
                    <div>
                        <h2 id="enroll-title">Ya recibimos tu solicitud para este curso</h2>
                        <p>
                            No necesitas enviarla de nuevo: Ciudad Pastel te contactará pronto.
                            Si quieres cambiar algún dato, escríbenos por WhatsApp.
                        </p>
                        <div className={styles.actions}>{whatsappButton}</div>
                    </div>
                </div>
            )}
        </section>
    );
}

export default EnrollmentRequest;
