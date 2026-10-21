import { useState } from "react";
import {
    CircleAlert,
    Eye,
    LoaderCircle,
    MessageCircle,
    Search
} from "lucide-react";

import StateMessage from "../../components/ui/StateMessage";
import { CIUDAD_PASTEL_WHATSAPP, ID_TYPES, whatsappLink } from "../../constants/enrollment";
import { getStudentRecipeBookFile, verifyStudentAccess } from "../../services/studentAccess.service";
import {
    EMPTY_ENROLLMENT_FORM,
    mapEnrollmentApiErrors,
    onlyDigits,
    toEnrollmentPayload,
    validateEnrollmentForm
} from "../../utils/enrollmentValidation";

import styles from "./MyRecipeBooks.module.css";

const FIELD_ORDER = ["fullName", "idNumber", "phone"];

const WHATSAPP_HELP_LINK = whatsappLink(
    CIUDAD_PASTEL_WHATSAPP,
    "Hola, necesito ayuda para consultar mis libros de recetas."
);

function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 bytes";
    if (bytes < 1024) return `${bytes} bytes`;

    const units = ["KB", "MB", "GB"];
    let size = bytes;
    let unit = -1;
    do {
        size /= 1024;
        unit += 1;
    } while (size >= 1024 && unit < units.length - 1);

    return `${new Intl.NumberFormat("es-CR", { maximumFractionDigits: 1 }).format(size)} ${units[unit]}`;
}

function MyRecipeBooks() {
    const [values, setValues] = useState(EMPTY_ENROLLMENT_FORM);
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [verifying, setVerifying] = useState(false);
    const [access, setAccess] = useState(null);
    const [message, setMessage] = useState(null);
    const [openingBookId, setOpeningBookId] = useState(null);

    const idType = ID_TYPES.find((type) => type.value === values.idType) ?? ID_TYPES[0];

    function updateField(name, value) {
        const next = { ...values, [name]: value };
        setValues(next);
        setErrors(validateEnrollmentForm(next));
    }

    function handleChange(event) {
        const { name, value } = event.target;
        if (name === "idNumber") {
            updateField(name, onlyDigits(value).slice(0, idType.maxDigits));
        } else if (name === "phone") {
            updateField(name, onlyDigits(value).slice(0, 8));
        } else {
            updateField(name, value);
        }
    }

    function fieldProps(name) {
        const showError = touched[name] && errors[name];
        return {
            id: `my-books-${name}`,
            name,
            value: values[name],
            onChange: handleChange,
            onBlur: () => {
                setTouched((previous) => ({ ...previous, [name]: true }));
                setErrors(validateEnrollmentForm(values));
            },
            disabled: verifying,
            "aria-invalid": showError ? true : undefined,
            "aria-describedby": `my-books-${name}-error`
        };
    }

    function renderError(name) {
        return touched[name] && errors[name] ? (
            <p id={`my-books-${name}-error`} className={styles.fieldError}>
                <CircleAlert size={14} aria-hidden="true" />
                {errors[name]}
            </p>
        ) : null;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setMessage(null);

        const validationErrors = validateEnrollmentForm(values);
        setErrors(validationErrors);
        setTouched(Object.fromEntries(FIELD_ORDER.map((field) => [field, true])));

        const firstInvalid = FIELD_ORDER.find((field) => validationErrors[field]);
        if (firstInvalid) {
            event.currentTarget.elements.namedItem(firstInvalid)?.focus();
            return;
        }

        const payload = toEnrollmentPayload(values);
        setValues(EMPTY_ENROLLMENT_FORM);
        setErrors({});
        setTouched({});
        setVerifying(true);

        try {
            setAccess(await verifyStudentAccess(payload));
        } catch (error) {
            if (error.status === 401) {
                setMessage({
                    variant: "notFound",
                    text: "No encontramos una inscripción con esos datos."
                });
            } else if (error.status === 400) {
                const apiErrors = mapEnrollmentApiErrors(error.details);
                setErrors(apiErrors);
                setTouched(Object.fromEntries(Object.keys(apiErrors).map((field) => [field, true])));
                setMessage({ variant: "error", text: "Revisa los datos marcados e inténtalo de nuevo." });
            } else if (error.status === 429) {
                setMessage({
                    variant: "error",
                    text: "Se realizaron varias consultas seguidas. Espera unos minutos e inténtalo de nuevo."
                });
            } else {
                setMessage({
                    variant: "error",
                    text: "No pudimos consultar tus libros. Revisa tu conexión e inténtalo de nuevo."
                });
            }
        } finally {
            setVerifying(false);
        }
    }

    async function handleOpenBook(course, book) {
        const openedTab = window.open("", "_blank");
        if (!openedTab) {
            setMessage({ variant: "error", text: "Permite las ventanas emergentes para abrir el PDF." });
            return;
        }

        openedTab.opener = null;
        openedTab.document.title = "Abriendo libro de recetas";
        openedTab.document.body.textContent = "Cargando el libro de recetas…";
        setOpeningBookId(book.id);
        setMessage(null);

        try {
            const file = await getStudentRecipeBookFile(course.id, book.id, access.accessToken);
            const fileUrl = URL.createObjectURL(file);
            openedTab.location.href = fileUrl;
            const cleanupTimer = window.setInterval(() => {
                if (openedTab.closed) {
                    window.clearInterval(cleanupTimer);
                    URL.revokeObjectURL(fileUrl);
                }
            }, 10000);
        } catch (error) {
            openedTab.close();
            if (error.status === 401) {
                setAccess(null);
                setMessage({ variant: "expired", text: "Tu sesión expiró, consulta de nuevo." });
            } else {
                setMessage({
                    variant: "error",
                    text: "No pudimos abrir el libro. Revisa tu conexión e inténtalo de nuevo."
                });
            }
        } finally {
            setOpeningBookId(null);
        }
    }

    function resetLookup() {
        setAccess(null);
        setMessage(null);
        setOpeningBookId(null);
    }

    return (
        <section className={styles.page}>
            <header className={styles.heading}>
                <p className={styles.eyebrow}>Ciudad Pastel · Academia</p>
                <h1>Mis libros de recetas</h1>
                <p>Consulta los libros de recetas de tus cursos con tus datos de inscripción.</p>
            </header>

            {!access && (
                <form className={styles.form} onSubmit={handleSubmit} noValidate>
                    {message && (
                        <div className={message.variant === "notFound" ? styles.notFound : styles.serverError} role="alert">
                            <CircleAlert size={18} aria-hidden="true" />
                            <span>{message.text}</span>
                            {message.variant === "notFound" && (
                                <a href={WHATSAPP_HELP_LINK} target="_blank" rel="noreferrer" className="btn btn-secondary">
                                    <MessageCircle size={16} aria-hidden="true" />
                                    Contactar por WhatsApp
                                </a>
                            )}
                            {message.variant === "expired" && (
                                <button type="button" className="btn btn-secondary" onClick={resetLookup}>
                                    Consultar de nuevo
                                </button>
                            )}
                        </div>
                    )}

                    <div className={styles.field}>
                        <label htmlFor="my-books-fullName">Nombre completo</label>
                        <input
                            type="text"
                            autoComplete="name"
                            maxLength={120}
                            placeholder="Ej.: Ana Mora Jiménez"
                            {...fieldProps("fullName")}
                        />
                        {renderError("fullName")}
                    </div>

                    <fieldset className={styles.documentTypes} disabled={verifying}>
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
                        <label htmlFor="my-books-idNumber">Número de {idType.short === "DIMEX" ? "DIMEX" : "cédula"}</label>
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
                        <label htmlFor="my-books-phone">Teléfono</label>
                        <input
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel-national"
                            placeholder="Ej.: 88887777"
                            {...fieldProps("phone")}
                        />
                        {renderError("phone")}
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={verifying}>
                        {verifying ? (
                            <>
                                <LoaderCircle size={17} className={styles.spin} aria-hidden="true" />
                                Consultando…
                            </>
                        ) : (
                            <>
                                <Search size={17} aria-hidden="true" />
                                Consultar mis libros
                            </>
                        )}
                    </button>
                </form>
            )}

            {access && (
                <section className={styles.results} aria-live="polite">
                    <div className={styles.resultsHeading}>
                        <h2>Libros de tus cursos</h2>
                        <button type="button" className="btn btn-secondary" onClick={resetLookup}>
                            Consultar otra vez
                        </button>
                    </div>

                    {message?.variant === "error" && (
                        <p className={styles.serverError} role="alert">
                            <CircleAlert size={18} aria-hidden="true" />
                            {message.text}
                        </p>
                    )}

                    {access.courses.length === 0 ? (
                        <StateMessage title="Aún no hay libros de recetas disponibles para tus cursos" />
                    ) : (
                        <div className={styles.courseList}>
                            {access.courses.map((course) => (
                                <section className={styles.course} key={course.id}>
                                    <h3>{course.name}</h3>
                                    <ul className={styles.bookList}>
                                        {course.recipeBooks.map((book) => (
                                            <li className={styles.book} key={book.id}>
                                                <div className={styles.bookInfo}>
                                                    <strong>{book.title}</strong>
                                                    <span>{book.fileName}</span>
                                                    <span>{formatFileSize(book.sizeBytes)}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary"
                                                    disabled={openingBookId !== null}
                                                    onClick={() => handleOpenBook(course, book)}
                                                >
                                                    {openingBookId === book.id ? (
                                                        <>
                                                            <LoaderCircle size={16} className={styles.spin} aria-hidden="true" />
                                                            Abriendo…
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Eye size={16} aria-hidden="true" />
                                                            Abrir PDF
                                                        </>
                                                    )}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    )}
                </section>
            )}
        </section>
    );
}

export default MyRecipeBooks;