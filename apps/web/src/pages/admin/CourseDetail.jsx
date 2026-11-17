import { adminReturnTo } from "../../utils/adminList";
import { useEffect, useRef, useState } from "react";
import {
    ArrowLeft,
    ClipboardList,
    BookOpen,
    CalendarDays,
    CircleAlert,
    Download,
    GraduationCap,
    ImageOff,
    LoaderCircle,
    ListChecks,
    MapPin,
    Package,
    Pencil,
    Trash2,
    Upload
} from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";

import CourseStatusActions from "../../components/admin/CourseStatusActions";
import CourseSeasonActions from "../../components/admin/CourseSeasonActions";
import CourseStudents from "../../components/admin/CourseStudents";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Notice from "../../components/ui/Notice";
import StateMessage, { RetryButton } from "../../components/ui/StateMessage";
import StatusBadge from "../../components/ui/StatusBadge";
import { getAdminCourseById } from "../../services/courses.service";
import {
    deleteRecipeBook,
    getRecipeBookFile,
    listRecipeBooks,
    uploadRecipeBook
} from "../../services/recipe-books.service";
import { COURSE_STATUS, canEditCourse, courseTypeLabel } from "../../constants/course";
import { formatCapacity, formatDate, formatDateTime, formatPrice } from "../../utils/format";
import { formatScheduleRange, formatScheduleSummary } from "../../utils/schedule";

import styles from "./CourseDetail.module.css";

const RECIPE_BOOK_MAX_BYTES = 20 * 1024 * 1024;

function CourseDetail() {
    const { id } = useParams();
    const location = useLocation();

    // Vuelve a la lista con el mismo filtro que tenía la persona
    const backTo = adminReturnTo(location.state?.from, "/admin/cursos");

    // Aviso que llega desde otra pantalla, ej. "El curso se creó correctamente"
    const flash = location.state?.flash;
    const [notice, setNotice] = useState(flash ? { variant: "success", text: flash } : null);

    const [state, setState] = useState({ id: null, status: "loading", course: null, error: null });
    const [reloadKey, setReloadKey] = useState(0);
    const [recipeBookFile, setRecipeBookFile] = useState(null);
    const [recipeBookTitle, setRecipeBookTitle] = useState("");
    const [recipeBookErrors, setRecipeBookErrors] = useState({});
    const [uploadingRecipeBook, setUploadingRecipeBook] = useState(false);
    const recipeBookFileInput = useRef(null);
    const [recipeBookListState, setRecipeBookListState] = useState({
        id: null,
        status: "loading",
        books: [],
        error: null
    });
    const [recipeBookListReloadKey, setRecipeBookListReloadKey] = useState(0);
    const [recipeBookAction, setRecipeBookAction] = useState(null);
    const [recipeBookToDelete, setRecipeBookToDelete] = useState(null);
    const [deletingRecipeBookId, setDeletingRecipeBookId] = useState(null);

    useEffect(() => {
        let active = true;

        getAdminCourseById(id)
            .then((course) => {
                if (active) setState({ id, status: "success", course, error: null });
            })
            .catch((error) => {
                if (active) setState({ id, status: "error", course: null, error });
            });

        return () => {
            active = false;
        };
    }, [id, reloadKey]);

    useEffect(() => {
        let active = true;

        listRecipeBooks(id)
            .then((books) => {
                if (active) {
                    setRecipeBookListState({
                        id,
                        key: recipeBookListReloadKey,
                        status: "success",
                        books,
                        error: null
                    });
                }
            })
            .catch((error) => {
                if (active) {
                    setRecipeBookListState({
                        id,
                        key: recipeBookListReloadKey,
                        status: "error",
                        books: [],
                        error
                    });
                }
            });

        return () => {
            active = false;
        };
    }, [id, recipeBookListReloadKey]);

    function retry() {
        setState({ id, status: "loading", course: null, error: null });
        setReloadKey((key) => key + 1);
    }

    function retryRecipeBookList() {
        setRecipeBookListReloadKey((key) => key + 1);
    }

    async function handleOpenRecipeBook(book) {
        const openedTab = window.open("", "_blank");
        if (!openedTab) {
            setNotice({
                variant: "error",
                text: "El navegador bloqueó la pestaña. Permita las ventanas emergentes para abrir el PDF."
            });
            return;
        }

        openedTab.opener = null;
        openedTab.document.title = "Abriendo libro de recetas";
        openedTab.document.body.textContent = "Cargando el libro de recetas…";
        setRecipeBookAction({ id: book.id, type: "open" });

        try {
            const file = await getRecipeBookFile(id, book.id);
            const fileUrl = URL.createObjectURL(file);
            openedTab.location.href = fileUrl;
            const cleanupTimer = window.setInterval(() => {
                if (openedTab.closed) {
                    window.clearInterval(cleanupTimer);
                    URL.revokeObjectURL(fileUrl);
                }
            }, 10000);
            setNotice({ variant: "success", text: `Se abrió «${book.title}» en otra pestaña.` });
        } catch (error) {
            openedTab.close();
            setNotice({
                variant: "error",
                text: error.message || "No se pudo abrir el libro de recetas. Intente de nuevo."
            });
        } finally {
            setRecipeBookAction(null);
        }
    }

    async function handleDownloadRecipeBook(book) {
        setRecipeBookAction({ id: book.id, type: "download" });

        try {
            const file = await getRecipeBookFile(id, book.id);
            const fileUrl = URL.createObjectURL(file);
            const link = document.createElement("a");
            link.href = fileUrl;
            link.download = book.fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
            setNotice({ variant: "success", text: `Se inició la descarga de «${book.title}».` });
        } catch (error) {
            setNotice({
                variant: "error",
                text: error.message || "No se pudo descargar el libro de recetas. Intente de nuevo."
            });
        } finally {
            setRecipeBookAction(null);
        }
    }

    async function handleDeleteRecipeBook() {
        if (!recipeBookToDelete) return;

        const book = recipeBookToDelete;
        setDeletingRecipeBookId(book.id);
        try {
            await deleteRecipeBook(id, book.id);
            setRecipeBookListReloadKey((key) => key + 1);
            setNotice({ variant: "success", text: `Se eliminó «${book.title}».` });
        } catch (error) {
            setNotice({
                variant: "error",
                text: error.message || "No se pudo eliminar el libro de recetas. Intente de nuevo."
            });
        } finally {
            setDeletingRecipeBookId(null);
            setRecipeBookToDelete(null);
        }
    }

    async function handleRecipeBookSubmit(event) {
        event.preventDefault();

        const errors = {};
        if (!recipeBookFile) {
            errors.file = "Seleccione un archivo PDF.";
        } else if (
            recipeBookFile.type !== "application/pdf" ||
            !recipeBookFile.name.toLowerCase().endsWith(".pdf")
        ) {
            errors.file = "El archivo debe ser un PDF.";
        } else if (recipeBookFile.size === 0) {
            errors.file = "El archivo está vacío.";
        } else if (recipeBookFile.size > RECIPE_BOOK_MAX_BYTES) {
            errors.file = "El archivo no puede superar los 20 MiB.";
        }

        const cleanTitle = recipeBookTitle.trim();
        if (!cleanTitle) {
            errors.title = "Escriba el título del libro de recetas.";
        } else if (cleanTitle.length < 3 || cleanTitle.length > 120) {
            errors.title = "El título debe tener entre 3 y 120 caracteres.";
        }

        setRecipeBookErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setUploadingRecipeBook(true);
        try {
            await uploadRecipeBook(id, recipeBookFile, cleanTitle);
            setRecipeBookListReloadKey((key) => key + 1);
            setRecipeBookFile(null);
            setRecipeBookTitle("");
            setRecipeBookErrors({});
            if (recipeBookFileInput.current) recipeBookFileInput.current.value = "";
            setNotice({ variant: "success", text: "El libro de recetas se subió correctamente." });
        } catch (error) {
            setNotice({
                variant: "error",
                text: error.message || "No se pudo subir el libro de recetas. Intente de nuevo."
            });
        } finally {
            setUploadingRecipeBook(false);
        }
    }

    // Si cambió el id en la URL, se muestra "cargando" hasta tener el curso nuevo
    const status = state.id === id ? state.status : "loading";

    const backLink = (
        <Link to={backTo} className={styles.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            {backTo.startsWith("/admin/solicitudes") ? "Volver a solicitudes" : "Volver a cursos"}
        </Link>
    );

    if (status === "loading") {
        return (
            <section className={styles.page} aria-busy="true">
                {backLink}
                <p className="sr-only" role="status">Cargando curso…</p>
                <div className={styles.card} aria-hidden="true">
                    <span className={styles.skeleton} style={{ width: "45%", height: "1.8rem" }} />
                    <span className={styles.skeleton} style={{ width: "80%" }} />
                    <span className={styles.skeleton} style={{ width: "60%" }} />
                </div>
            </section>
        );
    }

    if (status === "error") {
        const notFound = state.error?.status === 404;

        return (
            <section className={styles.page}>
                {backLink}
                <StateMessage
                    variant="error"
                    title={notFound ? "No encontramos este curso" : "No se pudo cargar el curso"}
                    description={
                        notFound
                            ? "Puede que se haya eliminado o que el enlace esté incorrecto."
                            : state.error?.message
                    }
                    action={
                        notFound ? (
                            <Link to={backTo} className="btn btn-primary">
                                Ir a la lista de cursos
                            </Link>
                        ) : (
                            <RetryButton onClick={retry} />
                        )
                    }
                />
            </section>
        );
    }

    const { course } = state;
    const recipeBookListStatus = recipeBookListState.id === id &&
        recipeBookListState.key === recipeBookListReloadKey
        ? recipeBookListState.status
        : "loading";
    const visibilityText = {
        [COURSE_STATUS.PUBLISHED]: "Este curso se muestra en la oferta pública de la Academia.",
        [COURSE_STATUS.DRAFT]: "Borrador: este curso no es visible para el público.",
        [COURSE_STATUS.ARCHIVED]: "Archivado: este curso ya no se ofrece ni es visible para el público."
    }[course.status];

    return (
        <section className={styles.page}>
            {backLink}

            {notice && (
                <Notice
                    variant={notice.variant}
                    action={notice.action}
                    onClose={() => setNotice(null)}
                >
                    {notice.text}
                </Notice>
            )}

            <article className={styles.card}>
                <div className={styles.top}>
                    <CourseImage url={course.imageUrl} name={course.name} />

                    <div className={styles.intro}>
                        <header className={styles.header}>
                            <h1>{course.name}</h1>
                            <StatusBadge status={course.status} />
                            {courseTypeLabel(course.courseType) && (
                                <span className={styles.typeTag}>{courseTypeLabel(course.courseType)}</span>
                            )}
                            {canEditCourse(course) && (
                                <Link
                                    to={`/admin/cursos/${course.id}/editar`}
                                    state={{ from: backTo }}
                                    className={`btn btn-secondary ${styles.editButton}`}
                                >
                                    <Pencil size={16} aria-hidden="true" />
                                    Editar
                                </Link>
                            )}
                        </header>

                        <p className={styles.visibility}>
                            {visibilityText}
                        </p>

                        <Link to={`/admin/solicitudes?curso=${course.id}`} className={styles.requestsLink}>
                            <ClipboardList size={16} aria-hidden="true" />
                            Ver solicitudes de matrícula de este curso
                        </Link>

                        <CourseStatusActions
                            course={course}
                            onChanged={(updated, message) => {
                                setState((prev) => ({ ...prev, course: updated }));
                                setNotice({ variant: "success", text: message });
                            }}
                            onError={(message, action) => setNotice({ variant: "error", text: message, action })}
                        />

                        <CourseSeasonActions
                            course={course}
                            editTo={`/admin/cursos/${course.id}/editar#course-seasonName`}
                            editState={{ from: backTo }}
                            allowEdit={canEditCourse(course)}
                            onChanged={(updated, message) => {
                                setState((previous) => ({ ...previous, course: updated }));
                                setNotice({ variant: "success", text: message });
                            }}
                            onError={(message) => setNotice({ variant: "error", text: message })}
                        />

                        {course.summary && (
                            <p className={styles.summary}>{course.summary}</p>
                        )}
                    </div>
                </div>

                {course.description && (
                    <section className={styles.block}>
                        <h2>Descripción</h2>
                        <p className={styles.description}>{course.description}</p>
                    </section>
                )}

                <section className={styles.block}>
                    <h2>
                        <CalendarDays size={18} aria-hidden="true" className={styles.blockIcon} />
                        Información de planificación
                    </h2>
                    <dl className={styles.planning}>
                        <div>
                            <dt>Instructor</dt>
                            <dd>{course.instructor ?? "Sin asignar"}</dd>
                        </div>
                        <div>
                            <dt>Capacidad</dt>
                            <dd>{formatCapacity(course.capacity)}</dd>
                        </div>
                        <div>
                            <dt>Precio</dt>
                            <dd>
                                {course.price == null
                                    ? "Sin definir (necesario para publicar)"
                                    : course.price === 0 ? "Gratis" : formatPrice(course.price)}
                                {course.reservationAmount != null && (
                                    <p className={styles.subtle}>
                                        Reserva: {formatPrice(course.reservationAmount)}
                                    </p>
                                )}
                                {course.priceNote && (
                                    <p className={styles.subtle}>{course.priceNote}</p>
                                )}
                            </dd>
                        </div>
                        <div className={styles.schedule}>
                            <dt>Horario</dt>
                            <dd>
                                <ScheduleText schedule={course.schedule} />
                            </dd>
                        </div>
                    </dl>
                </section>

                <CourseStudents course={course} />

                {(course.location || course.address) && (
                    <section className={styles.block}>
                        <h2>
                            <MapPin size={18} aria-hidden="true" className={styles.blockIcon} />
                            Lugar
                        </h2>
                        {course.location && <p className={styles.strong}>{course.location}</p>}
                        {course.address && <p className={styles.preLine}>{course.address}</p>}
                    </section>
                )}

                <div className={styles.lists}>
                    <ItemList
                        icon={GraduationCap}
                        title="¿Qué aprenderá el estudiante?"
                        items={course.learningOutcomes}
                        note={course.whatYouWillLearn}
                        emptyText="No se han agregado aprendizajes."
                    />
                    <ItemList
                        icon={Package}
                        title="Materiales que debe traer"
                        items={course.requiredMaterials}
                        note={course.materialsNote}
                        emptyText="No se han agregado materiales."
                    />
                </div>

                {course.prerequisites && (
                    <section className={styles.block}>
                        <h2>
                            <ListChecks size={18} aria-hidden="true" className={styles.blockIcon} />
                            Requisitos previos
                        </h2>
                        <p className={styles.preLine}>{course.prerequisites}</p>
                    </section>
                )}

                <section className={styles.block}>
                    <h2>
                        <Upload size={18} aria-hidden="true" className={styles.blockIcon} />
                        Libros de recetas
                    </h2>
                    <form className={styles.recipeBookForm} onSubmit={handleRecipeBookSubmit} noValidate>
                        <div className={styles.recipeBookField}>
                            <label htmlFor="recipe-book-file">Archivo PDF *</label>
                            <div className={styles.recipeBookFilePicker}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={uploadingRecipeBook}
                                    onClick={() => recipeBookFileInput.current?.click()}
                                >
                                    Seleccionar archivo PDF
                                </button>
                                <span className={styles.recipeBookFileName} aria-live="polite">
                                    {recipeBookFile?.name ?? "Ningún archivo seleccionado"}
                                </span>
                                <input
                                    ref={recipeBookFileInput}
                                    id="recipe-book-file"
                                    name="file"
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    required
                                    disabled={uploadingRecipeBook}
                                    className={styles.visuallyHiddenInput}
                                    tabIndex={-1}
                                    aria-hidden="true"
                                    aria-invalid={recipeBookErrors.file ? "true" : undefined}
                                    aria-describedby="recipe-book-file-hint recipe-book-file-error"
                                    onChange={(event) => {
                                        setRecipeBookFile(event.target.files?.[0] ?? null);
                                        setRecipeBookErrors((previous) => ({ ...previous, file: "" }));
                                    }}
                                />
                            </div>
                            <p id="recipe-book-file-hint" className={styles.recipeBookHint}>
                                Tamaño máximo: 20 MiB.
                            </p>
                            {recipeBookErrors.file && (
                                <p id="recipe-book-file-error" className={styles.recipeBookError}>
                                    <CircleAlert size={14} aria-hidden="true" />
                                    {recipeBookErrors.file}
                                </p>
                            )}
                        </div>

                        <div className={styles.recipeBookField}>
                            <label htmlFor="recipe-book-title">Título *</label>
                            <input
                                id="recipe-book-title"
                                name="title"
                                type="text"
                                value={recipeBookTitle}
                                minLength={3}
                                maxLength={120}
                                required
                                disabled={uploadingRecipeBook}
                                aria-invalid={recipeBookErrors.title ? "true" : undefined}
                                aria-describedby="recipe-book-title-error"
                                onChange={(event) => {
                                    setRecipeBookTitle(event.target.value);
                                    setRecipeBookErrors((previous) => ({ ...previous, title: "" }));
                                }}
                            />
                            {recipeBookErrors.title && (
                                <p id="recipe-book-title-error" className={styles.recipeBookError}>
                                    <CircleAlert size={14} aria-hidden="true" />
                                    {recipeBookErrors.title}
                                </p>
                            )}
                        </div>

                        <div className={styles.recipeBookActions}>
                            <button type="submit" className="btn btn-primary" disabled={uploadingRecipeBook}>
                                {uploadingRecipeBook ? (
                                    <>
                                        <LoaderCircle size={16} className={styles.spin} aria-hidden="true" />
                                        Subiendo…
                                    </>
                                ) : (
                                    <>
                                        <Upload size={16} aria-hidden="true" />
                                        Subir
                                    </>
                                )}
                            </button>
                            {uploadingRecipeBook && <span role="status">Subiendo libro de recetas…</span>}
                        </div>
                    </form>

                    {recipeBookListStatus === "loading" && (
                        <p className={styles.recipeBookLoading} role="status" aria-busy="true">
                            <LoaderCircle size={16} className={styles.spin} aria-hidden="true" />
                            Cargando libros de recetas…
                        </p>
                    )}
                    {recipeBookListStatus === "error" && (
                        <StateMessage
                            variant="error"
                            title="No se pudieron cargar los libros de recetas"
                            description={recipeBookListState.error?.message}
                            action={<RetryButton onClick={retryRecipeBookList} />}
                        />
                    )}
                    {recipeBookListStatus === "success" && recipeBookListState.books.length === 0 && (
                        <StateMessage title="Este curso aún no tiene libros de recetas" />
                    )}
                    {recipeBookListStatus === "success" && recipeBookListState.books.length > 0 && (
                        <ul className={styles.recipeBookList}>
                            {recipeBookListState.books.map((book) => {
                                const busy = Boolean(recipeBookAction) || deletingRecipeBookId === book.id;
                                return (
                                    <li className={styles.recipeBookItem} key={book.id}>
                                        <div className={styles.recipeBookInfo}>
                                            <strong>{book.title}</strong>
                                            <span>Archivo: {book.fileName}</span>
                                            <span>Subido: {formatDateTime(book.createdAt)}</span>
                                        </div>
                                        <div className={styles.recipeBookRowActions}>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                disabled={busy}
                                                onClick={() => handleOpenRecipeBook(book)}
                                            >
                                                {recipeBookAction?.id === book.id && recipeBookAction.type === "open" ? (
                                                    <LoaderCircle size={16} className={styles.spin} aria-hidden="true" />
                                                ) : (
                                                    <BookOpen size={16} aria-hidden="true" />
                                                )}
                                                {recipeBookAction?.id === book.id && recipeBookAction.type === "open"
                                                    ? "Abriendo…"
                                                    : "Abrir"}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                disabled={busy}
                                                onClick={() => handleDownloadRecipeBook(book)}
                                            >
                                                {recipeBookAction?.id === book.id && recipeBookAction.type === "download" ? (
                                                    <LoaderCircle size={16} className={styles.spin} aria-hidden="true" />
                                                ) : (
                                                    <Download size={16} aria-hidden="true" />
                                                )}
                                                {recipeBookAction?.id === book.id && recipeBookAction.type === "download"
                                                    ? "Descargando…"
                                                    : "Descargar"}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-danger"
                                                disabled={busy}
                                                onClick={() => setRecipeBookToDelete(book)}
                                            >
                                                <Trash2 size={16} aria-hidden="true" />
                                                Eliminar
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <ConfirmDialog
                        open={Boolean(recipeBookToDelete)}
                        title="¿Eliminar este libro de recetas?"
                        confirmLabel={deletingRecipeBookId ? "Eliminando…" : "Eliminar"}
                        confirmIcon={Trash2}
                        busy={Boolean(deletingRecipeBookId)}
                        onConfirm={handleDeleteRecipeBook}
                        onCancel={() => {
                            if (!deletingRecipeBookId) setRecipeBookToDelete(null);
                        }}
                    >
                        {recipeBookToDelete && (
                            <p>Se eliminará «{recipeBookToDelete.title}». Esta acción no se puede deshacer.</p>
                        )}
                    </ConfirmDialog>
                </section>

                <footer className={styles.meta}>
                    <span>Creado: {formatDateTime(course.createdAt)}</span>
                    <span>Última modificación: {formatDateTime(course.updatedAt)}</span>
                </footer>
            </article>
        </section>
    );
}

function CourseImage({ url, name }) {
    const [broken, setBroken] = useState(false);

    if (!url || broken) {
        return (
            <div className={styles.imageEmpty}>
                <ImageOff size={32} aria-hidden="true" />
                <span>{url ? "No se pudo cargar la imagen" : "Sin imagen"}</span>
            </div>
        );
    }

    return (
        <img
            src={url}
            alt={`Imagen del curso ${name}`}
            className={styles.image}
            onError={() => setBroken(true)}
        />
    );
}

/*
 * Horario legible: "Todos los lunes, de 1:00 p. m. a 5:00 p. m." y debajo las
 * fechas. Los cursos viejos (sin horas ni frecuencia) muestran su nota y fechas.
 */
function ScheduleText({ schedule }) {
    if (schedule == null) return "Sin definir";

    const summary = formatScheduleSummary(schedule);
    const range = formatScheduleRange(schedule);

    return (
        <>
            {summary && <p className={styles.scheduleDescription}>{summary}</p>}
            {range && <p>{range}</p>}
            {!summary && (
                <>
                    <p>Inicio: {formatDate(schedule.startDate)}</p>
                    {schedule.endDate != null && schedule.endDate !== schedule.startDate && (
                        <p>Fin: {formatDate(schedule.endDate)}</p>
                    )}
                </>
            )}
            {schedule.scheduleNote && (
                <p className={styles.subtle}>{schedule.scheduleNote}</p>
            )}
        </>
    );
}

function ItemList({ icon: Icon, title, items = [], note, emptyText }) {
    return (
        <section className={styles.block}>
            <h2>
                <Icon size={18} aria-hidden="true" className={styles.blockIcon} />
                {title}
            </h2>
            {items.length === 0 && !note && (
                <p className={styles.empty}>{emptyText}</p>
            )}
            {items.length > 0 && (
                <ul className={styles.itemList}>
                    {items.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            )}
            {note && <p className={styles.preLine}>{note}</p>}
        </section>
    );
}

export default CourseDetail;
