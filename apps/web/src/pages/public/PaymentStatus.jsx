import { useState } from "react";
import {
    CircleAlert,
    CircleCheck,
    CircleDollarSign,
    LoaderCircle,
    MessageCircle,
    Search
} from "lucide-react";

import StateMessage from "../../components/ui/StateMessage";
import {
    CIUDAD_PASTEL_WHATSAPP,
    ID_TYPE,
    ID_TYPES,
    whatsappLink
} from "../../constants/enrollment";
import { lookupPaymentStatus } from "../../services/enrollments.service";
import {
    onlyDigits,
    validateEnrollmentIdentityAndPhone
} from "../../utils/enrollmentValidation";

import styles from "./PaymentStatus.module.css";

const EMPTY_FORM = {
    idType: ID_TYPE.NATIONAL,
    idNumber: "",
    phone: ""
};

const FIELD_ORDER = ["idNumber", "phone"];

const PAYMENT_DETAILS = {
    pending: {
        label: "Pendiente",
        description: "Aún no hemos registrado tu pago.",
        className: "pending"
    },
    deposit_paid: {
        label: "Adelanto pagado",
        description: "Registramos tu adelanto; queda un saldo por coordinar.",
        className: "depositPaid"
    },
    paid: {
        label: "Pagado",
        description: "Tu pago está completo.",
        className: "paid"
    }
};

const WHATSAPP_NOT_FOUND = whatsappLink(
    CIUDAD_PASTEL_WHATSAPP,
    "Hola, necesito ayuda para consultar el estado de pago de mi matrícula."
);

const WHATSAPP_COORDINATE = whatsappLink(
    CIUDAD_PASTEL_WHATSAPP,
    "Hola, quisiera coordinar el pago de mi matrícula."
);

function getErrorMessage(error) {
    if (error?.status === 400) {
        return "Revisa los datos marcados e inténtalo de nuevo.";
    }
    if (error?.status === 429) {
        return "Se realizaron varias consultas seguidas. Espera unos minutos e inténtalo de nuevo.";
    }
    return "No pudimos consultar el estado de pago. Revisa tu conexión e inténtalo de nuevo.";
}

function getPaymentDetails(status) {
    return PAYMENT_DETAILS[status] ?? PAYMENT_DETAILS.pending;
}

function PaymentStatus() {
    const [values, setValues] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [loading, setLoading] = useState(false);
    const [enrollments, setEnrollments] = useState(null);
    const [message, setMessage] = useState(null);

    const idType = ID_TYPES.find((type) => type.value === values.idType) ?? ID_TYPES[0];

    function updateField(name, value) {
        const next = { ...values, [name]: value };
        setValues(next);
        setErrors(validateEnrollmentIdentityAndPhone(next));
    }

    function handleChange(event) {
        const { name, value } = event.target;
        if (name === "idNumber") {
            updateField(name, onlyDigits(value).slice(0, idType.maxDigits));
        } else if (name === "phone") {
            updateField(name, onlyDigits(value).slice(0, 8));
        }
    }

    function fieldProps(name) {
        const showError = touched[name] && errors[name];
        return {
            id: `payment-status-${name}`,
            name,
            value: values[name],
            onChange: handleChange,
            onBlur: () => {
                setTouched((previous) => ({ ...previous, [name]: true }));
                setErrors(validateEnrollmentIdentityAndPhone(values));
            },
            disabled: loading,
            "aria-invalid": showError ? true : undefined,
            "aria-describedby": `payment-status-${name}-error`
        };
    }

    function renderError(name) {
        return touched[name] && errors[name] ? (
            <p id={`payment-status-${name}-error`} className={styles.fieldError}>
                <CircleAlert size={14} aria-hidden="true" />
                {errors[name]}
            </p>
        ) : null;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setMessage(null);
        setEnrollments(null);

        const validationErrors = validateEnrollmentIdentityAndPhone(values);
        setErrors(validationErrors);
        setTouched(Object.fromEntries(FIELD_ORDER.map((field) => [field, true])));

        const firstInvalid = FIELD_ORDER.find((field) => validationErrors[field]);
        if (firstInvalid) {
            event.currentTarget.elements.namedItem(firstInvalid)?.focus();
            return;
        }

        const payload = {
            nationalId: onlyDigits(values.idNumber),
            phone: onlyDigits(values.phone)
        };
        setValues(EMPTY_FORM);
        setErrors({});
        setTouched({});
        setLoading(true);

        try {
            const result = await lookupPaymentStatus(payload);
            setEnrollments(Array.isArray(result.enrollments) ? result.enrollments : []);
        } catch (error) {
            setMessage({ variant: "error", text: getErrorMessage(error) });
        } finally {
            setLoading(false);
        }
    }

    return (
        <section className={styles.page}>
            <header className={styles.heading}>
                <p className={styles.eyebrow}>Ciudad Pastel · Academia</p>
                <h1>Consulta el estado de pago</h1>
                <p>Ingresa los datos que usaste al matricularte para consultar tus cursos.</p>
            </header>

            <aside className={styles.paymentNotice}>
                <CircleDollarSign size={24} aria-hidden="true" />
                <div>
                    <strong>
                        El pago se coordina directamente con Ciudad Pastel. En este sitio no se realiza ningún pago.
                    </strong>
                    <a href={WHATSAPP_COORDINATE} target="_blank" rel="noreferrer" className="btn btn-secondary">
                        <MessageCircle size={16} aria-hidden="true" />
                        Coordinar por WhatsApp
                    </a>
                </div>
            </aside>

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
                {message && (
                    <p className={styles.serverError} role="alert">
                        <CircleAlert size={18} aria-hidden="true" />
                        {message.text}
                    </p>
                )}

                <fieldset className={styles.documentTypes} disabled={loading}>
                    <legend>Tipo de documento</legend>
                    <div className={styles.choices}>
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
                                    onChange={() => updateField("idType", type.value)}
                                />
                                {type.label}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div className={styles.field}>
                    <label htmlFor="payment-status-idNumber">
                        Número de {idType.short === "DIMEX" ? "DIMEX" : "cédula"}
                    </label>
                    <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={idType.hint}
                        {...fieldProps("idNumber")}
                    />
                    {renderError("idNumber")}
                </div>

                <div className={styles.field}>
                    <label htmlFor="payment-status-phone">Teléfono</label>
                    <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="Ej.: 88887777"
                        {...fieldProps("phone")}
                    />
                    {renderError("phone")}
                </div>

                <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? (
                        <>
                            <LoaderCircle size={17} className={styles.spin} aria-hidden="true" />
                            Consultando…
                        </>
                    ) : (
                        <>
                            <Search size={17} aria-hidden="true" />
                            Consultar estado de pago
                        </>
                    )}
                </button>
            </form>

            {enrollments !== null && enrollments.length === 0 && (
                <StateMessage
                    title="No encontramos matrículas con esos datos"
                    description="Verifica la información o escríbenos; con gusto te ayudamos."
                    action={(
                        <a href={WHATSAPP_NOT_FOUND} target="_blank" rel="noreferrer" className="btn btn-secondary">
                            <MessageCircle size={16} aria-hidden="true" />
                            Contactar por WhatsApp
                        </a>
                    )}
                />
            )}

            {enrollments !== null && enrollments.length > 0 && (
                <section className={styles.results} aria-live="polite">
                    <h2>Tus matrículas</h2>
                    <ul className={styles.courseList}>
                        {enrollments.map((enrollment, index) => {
                            const details = getPaymentDetails(enrollment.paymentStatus);
                            return (
                                <li className={styles.course} key={`${enrollment.courseName}-${index}`}>
                                    <div className={styles.courseHeading}>
                                        <CircleCheck size={20} aria-hidden="true" />
                                        <h3>{enrollment.courseName}</h3>
                                    </div>
                                    <span className={`${styles.statusBadge} ${styles[details.className]}`}>
                                        {details.label}
                                    </span>
                                    <p className={styles.statusDescription}>{details.description}</p>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
        </section>
    );
}

export default PaymentStatus;
