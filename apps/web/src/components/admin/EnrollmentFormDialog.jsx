import { useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, X } from "lucide-react";

import { ID_TYPE, ID_TYPES } from "../../constants/enrollment";
import { enrollmentErrorMessage } from "../../services/enrollments.service";
import {
    ENROLLMENT_LIMITS,
    NOTE_MAX,
    mapEnrollmentApiErrors,
    onlyDigits,
    toEnrollmentPayload,
    validateEnrollmentForm
} from "../../utils/enrollmentValidation";

import styles from "./EnrollmentFormDialog.module.css";

const FIELD_ORDER = ["fullName", "idNumber", "phone", "note"];

const EMPTY = { fullName: "", idType: ID_TYPE.NATIONAL, idNumber: "", phone: "", note: "" };

/**
 * Ventana con los datos de una matrícula (HU-A09). Se usa para confirmar una
 * solicitud (datos precargados), registrar a alguien a mano y corregir datos.
 *   title, subtitle: encabezado (ej. el nombre del curso)
 *   initialValues: { fullName, idType, idNumber, phone, note }
 *   submitLabel, submitIcon
 *   onSubmit(payload): async; si falla, el error se muestra en la ventana
 *   onClose()
 * Se monta solo mientras está abierta.
 */
function EnrollmentFormDialog({
    title,
    subtitle,
    initialValues,
    submitLabel,
    submitIcon: SubmitIcon,
    onSubmit,
    onClose
}) {
    const [values, setValues] = useState({ ...EMPTY, ...initialValues, note: initialValues?.note ?? "" });
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [serverError, setServerError] = useState("");

    const dialogRef = useRef(null);
    const formRef = useRef(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();
        formRef.current?.elements.namedItem("fullName")?.focus();
    }, []);

    const idType = ID_TYPES.find((type) => type.value === values.idType) ?? ID_TYPES[0];

    function update(name, value) {
        const next = { ...values, [name]: value };
        setValues(next);
        setErrors(validateEnrollmentForm(next, { formal: true }));
    }

    function handleChange(event) {
        const { name, value } = event.target;
        if (name === "idNumber") update(name, onlyDigits(value).slice(0, idType.maxDigits));
        else if (name === "phone") update(name, onlyDigits(value).slice(0, 8));
        else update(name, value);
    }

    function handleBlur(event) {
        setTouched((prev) => ({ ...prev, [event.target.name]: true }));
        setErrors(validateEnrollmentForm(values, { formal: true }));
    }

    function close() {
        if (!submitting) onClose();
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setServerError("");

        const validationErrors = validateEnrollmentForm(values, { formal: true });
        setErrors(validationErrors);
        setTouched(Object.fromEntries(FIELD_ORDER.map((field) => [field, true])));

        const firstInvalid = FIELD_ORDER.find((field) => validationErrors[field]);
        if (firstInvalid) {
            formRef.current?.elements.namedItem(firstInvalid)?.focus();
            return;
        }

        setSubmitting(true);

        try {
            await onSubmit({ ...toEnrollmentPayload(values), note: values.note.trim() || null });
        } catch (error) {
            if (error.status === 400) {
                const fieldErrors = mapEnrollmentApiErrors(error.details, { formal: true });
                setErrors((prev) => ({ ...prev, ...fieldErrors }));
                setTouched((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(fieldErrors).map((f) => [f, true])) }));
            }
            setServerError(enrollmentErrorMessage(error));
            setSubmitting(false);
        }
    }

    function fieldProps(name) {
        const showError = touched[name] && errors[name];
        return {
            id: `enrollment-${name}`,
            name,
            value: values[name],
            onChange: handleChange,
            onBlur: handleBlur,
            disabled: submitting,
            "aria-invalid": showError ? true : undefined,
            "aria-describedby": `enrollment-${name}-hint enrollment-${name}-error`
        };
    }

    function messages(name, hint) {
        return (
            <>
                {hint && <p id={`enrollment-${name}-hint`} className={styles.hint}>{hint}</p>}
                {touched[name] && errors[name] && (
                    <p id={`enrollment-${name}-error`} className={styles.fieldError}>
                        <CircleAlert size={14} aria-hidden="true" />
                        {errors[name]}
                    </p>
                )}
            </>
        );
    }

    return (
        <dialog
            ref={dialogRef}
            className={styles.dialog}
            aria-labelledby="enrollment-dialog-title"
            onCancel={(event) => {
                event.preventDefault();
                close();
            }}
        >
            <form ref={formRef} onSubmit={handleSubmit} noValidate className={styles.form}>
                <header className={styles.header}>
                    <div>
                        <h2 id="enrollment-dialog-title">{title}</h2>
                        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        className={styles.close}
                        onClick={close}
                        disabled={submitting}
                        aria-label="Cerrar"
                        title="Cerrar"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </header>

                {serverError && (
                    <p role="alert" className={styles.serverError}>
                        <CircleAlert size={18} aria-hidden="true" />
                        {serverError}
                    </p>
                )}

                <div className={styles.field}>
                    <label htmlFor="enrollment-fullName">Nombre completo</label>
                    <input type="text" autoComplete="off" maxLength={ENROLLMENT_LIMITS.fullName.max} {...fieldProps("fullName")} />
                    {messages("fullName", "Tal como aparecerá en el certificado.")}
                </div>

                <div className={styles.field}>
                    <span id="enrollment-idType-label" className={styles.label}>Tipo de documento</span>
                    <div role="radiogroup" aria-labelledby="enrollment-idType-label" className={styles.choices}>
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
                                    onChange={() => update("idType", type.value)}
                                    disabled={submitting}
                                />
                                {type.label}
                            </label>
                        ))}
                    </div>
                </div>

                <div className={styles.row}>
                    <div className={styles.field}>
                        <label htmlFor="enrollment-idNumber">Número de {idType.value === ID_TYPE.DIMEX ? "DIMEX" : "cédula"}</label>
                        <input type="text" inputMode="numeric" autoComplete="off" {...fieldProps("idNumber")} />
                        {messages("idNumber", idType.hint)}
                    </div>

                    <div className={styles.field}>
                        <label htmlFor="enrollment-phone">Teléfono</label>
                        <input type="tel" inputMode="numeric" autoComplete="off" {...fieldProps("phone")} />
                        {messages("phone", "8 dígitos.")}
                    </div>
                </div>

                <div className={styles.field}>
                    <label htmlFor="enrollment-note">Nota (opcional)</label>
                    <textarea
                        rows={2}
                        maxLength={NOTE_MAX}
                        placeholder="Ej.: Pagó por SINPE el 20 de octubre"
                        {...fieldProps("note")}
                    />
                    {messages("note")}
                </div>

                <div className={styles.actions}>
                    <button type="button" className="btn btn-secondary" onClick={close} disabled={submitting}>
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting}
                        onMouseDown={(event) => event.preventDefault()}
                    >
                        {submitting
                            ? <LoaderCircle size={18} className={styles.spin} aria-hidden="true" />
                            : SubmitIcon && <SubmitIcon size={18} aria-hidden="true" />}
                        {submitting ? "Guardando…" : submitLabel}
                    </button>
                </div>
            </form>
        </dialog>
    );
}

export default EnrollmentFormDialog;
