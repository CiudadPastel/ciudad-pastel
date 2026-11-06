import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, LoaderCircle, Save, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import StepProgress from "../../components/ui/StepProgress";
import { RetryButton } from "../../components/ui/StateMessage";
import {
    createAdminProduct,
    getAdminCategories,
    updateAdminProduct
} from "../../services/products.service";
import { formatPrice } from "../../utils/format";

import styles from "./ProductCreate.module.css";

const LIMITS = {
    name: { min: 3, max: 120 },
    brand: { max: 60 },
    description: { max: 1000 },
    weight: { max: 40 },
    size: { max: 40 },
    price: { min: 1, max: 10_000_000 },
    imageUrl: { max: 500 }
};

const FIELD_ORDER = ["name", "brand", "description", "weight", "size", "price", "categoryId", "imageUrl", "available"];
const STEPS = [
    { title: "Información básica", description: "Nombre y categoría", fields: ["name", "categoryId"] },
    { title: "Detalles", description: "Descripción e imagen", fields: ["brand", "description", "weight", "size", "imageUrl"] },
    { title: "Precio y disponibilidad", description: "Precio de venta", fields: ["price", "available"] }
];
const INITIAL_VALUES = {
    name: "",
    brand: "",
    description: "",
    weight: "",
    size: "",
    price: "",
    categoryId: "",
    imageUrl: "",
    available: true
};

function productToFormValues(product) {
    if (!product) return { ...INITIAL_VALUES };

    return {
        name: product.name ?? "",
        brand: product.brand ?? "",
        description: product.description ?? "",
        weight: product.weight ?? "",
        size: product.size ?? "",
        price: product.price == null ? "" : String(product.price),
        categoryId: product.categoryId ?? "",
        imageUrl: product.imageUrl ?? "",
        available: Boolean(product.available)
    };
}

function isValidImageUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function validate(values) {
    const errors = {};
    const name = values.name.trim();

    if (!name) errors.name = "Escriba el nombre del producto.";
    else if (name.length < LIMITS.name.min) errors.name = "El nombre debe tener al menos 3 caracteres.";
    else if (name.length > LIMITS.name.max) errors.name = "El nombre puede tener como máximo 120 caracteres.";

    for (const field of ["brand", "description", "weight", "size"]) {
        if (values[field].trim().length > LIMITS[field].max) {
            const labels = {
                brand: "La marca",
                description: "La descripción",
                weight: "El peso",
                size: "El tamaño"
            };
            errors[field] = `${labels[field]} puede tener como máximo ${LIMITS[field].max} caracteres.`;
        }
    }

    const rawPrice = values.price.trim();
    const price = Number(rawPrice);
    if (!rawPrice) errors.price = "Escriba el precio del producto.";
    else if (!Number.isInteger(price)) errors.price = "El precio debe ser un número entero de colones, sin decimales.";
    else if (price < LIMITS.price.min || price > LIMITS.price.max) {
        errors.price = "El precio debe estar entre ₡1 y ₡10.000.000.";
    }

    if (!values.categoryId) errors.categoryId = "Seleccione una categoría.";

    const imageUrl = values.imageUrl.trim();
    if (imageUrl.length > LIMITS.imageUrl.max) {
        errors.imageUrl = "El enlace de la imagen puede tener como máximo 500 caracteres.";
    } else if (imageUrl && !isValidImageUrl(imageUrl)) {
        errors.imageUrl = "Escriba un enlace válido que comience con http:// o https://.";
    }

    return errors;
}

function mapServerValidationErrors(details) {
    const errors = {};
    if (!Array.isArray(details)) return errors;

    for (const detail of details) {
        const text = String(detail);
        const field = text.match(/^[a-zA-Z]+/)?.[0];

        if (field === "name") {
            errors.name = /is required/.test(text)
                ? "Escriba el nombre del producto."
                : "El nombre debe tener entre 3 y 120 caracteres.";
        } else if (field === "price") {
            errors.price = "El precio debe ser un número entero entre ₡1 y ₡10.000.000.";
        } else if (field === "categoryId") {
            errors.categoryId = "Seleccione una categoría existente.";
        } else if (field === "imageUrl") {
            errors.imageUrl = "El enlace de la imagen debe ser una URL HTTP o HTTPS de hasta 500 caracteres.";
        } else if (["brand", "description", "weight", "size"].includes(field)) {
            const labels = {
                brand: "La marca",
                description: "La descripción",
                weight: "El peso",
                size: "El tamaño"
            };
            const max = LIMITS[field].max;
            errors[field] = `${labels[field]} debe ser texto de hasta ${max} caracteres.`;
        } else if (field === "available") {
            errors.available = "Revise la disponibilidad seleccionada.";
        }
    }

    return errors;
}

function ProductCreate({ product = null }) {
    const isEditing = product !== null;
    const navigate = useNavigate();
    const formRef = useRef(null);
    const stepHeadingRef = useRef(null);
    const initialValues = productToFormValues(product);
    const [currentStep, setCurrentStep] = useState(0);
    const [values, setValues] = useState(initialValues);
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [serverError, setServerError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [categoryState, setCategoryState] = useState({
        status: "loading",
        categories: [],
        error: null
    });
    const [categoryReloadKey, setCategoryReloadKey] = useState(0);

    const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);
    const nothingToSave = isEditing && !isDirty;

    useEffect(() => {
        stepHeadingRef.current?.focus();
    }, [currentStep]);

    useEffect(() => {
        let active = true;

        getAdminCategories()
            .then((categories) => {
                if (active) setCategoryState({ status: "success", categories, error: null });
            })
            .catch((error) => {
                if (active) setCategoryState({ status: "error", categories: [], error });
            });

        return () => {
            active = false;
        };
    }, [categoryReloadKey]);

    function updateValue(name, value) {
        const nextValues = { ...values, [name]: value };
        setValues(nextValues);
        setErrors(validate(nextValues));
        setServerError("");
    }

    function handleBlur(event) {
        const { name } = event.target;
        setTouched((previous) => ({ ...previous, [name]: true }));
        setErrors(validate(values));
    }

    function validateCurrentStep() {
        const allErrors = validate(values);
        const stepFields = STEPS[currentStep].fields;
        const stepErrors = Object.fromEntries(
            stepFields.filter((field) => allErrors[field]).map((field) => [field, allErrors[field]])
        );
        setErrors((previous) => ({
            ...previous,
            ...Object.fromEntries(stepFields.map((field) => [field, allErrors[field]]))
        }));
        setTouched((previous) => ({
            ...previous,
            ...Object.fromEntries(stepFields.map((field) => [field, true]))
        }));

        const firstInvalid = stepFields.find((field) => stepErrors[field]);
        if (firstInvalid) {
            formRef.current?.elements.namedItem(firstInvalid)?.focus();
            return false;
        }

        return true;
    }

    function handleContinue() {
        setServerError("");
        if (!validateCurrentStep()) return;
        if (currentStep === 0 && !categoriesReady) return;
        setCurrentStep((step) => Math.min(step + 1, STEPS.length - 1));
    }

    function handlePrevious() {
        setServerError("");
        setCurrentStep((step) => Math.max(step - 1, 0));
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setServerError("");

        if (currentStep < STEPS.length - 1) {
            handleContinue();
            return;
        }

        if (!validateCurrentStep()) return;
        if (categoryState.status !== "success" || categoryState.categories.length === 0) return;

        setSubmitting(true);
        try {
            const payload = {
                name: values.name.trim(),
                brand: values.brand.trim() || null,
                description: values.description.trim() || null,
                weight: values.weight.trim() || null,
                size: values.size.trim() || null,
                price: Number(values.price),
                categoryId: values.categoryId,
                imageUrl: values.imageUrl.trim() || null,
                available: values.available
            };
            if (isEditing) await updateAdminProduct(product.id, payload);
            else await createAdminProduct(payload);

            navigate("/admin/productos", {
                replace: true,
                state: {
                    flash: isEditing
                        ? "Producto actualizado correctamente."
                        : "Producto creado correctamente."
                }
            });
        } catch (error) {
            const serverFieldErrors = mapServerValidationErrors(error.details);
            if (Object.keys(serverFieldErrors).length > 0) {
                setErrors((previous) => ({ ...previous, ...serverFieldErrors }));
                setTouched((previous) => ({
                    ...previous,
                    ...Object.fromEntries(Object.keys(serverFieldErrors).map((field) => [field, true]))
                }));
                setServerError("El servidor encontró datos que debe revisar:");
                const firstServerField = FIELD_ORDER.find((field) => serverFieldErrors[field]);
                const errorStep = STEPS.findIndex((step) => step.fields.includes(firstServerField));
                if (errorStep >= 0 && errorStep !== currentStep) {
                    setCurrentStep(errorStep);
                } else if (firstServerField) {
                    formRef.current?.elements.namedItem(firstServerField)?.focus();
                }
            } else {
                setServerError(error.message || "No se pudo guardar el producto.");
            }
        } finally {
            setSubmitting(false);
        }
    }

    function renderFieldError(name) {
        return touched[name] && errors[name] ? (
            <p id={`product-${name}-error`} className={styles.fieldError}>
                <CircleAlert size={14} aria-hidden="true" />
                {errors[name]}
            </p>
        ) : null;
    }

    function fieldProps(name) {
        return {
            id: `product-${name}`,
            name,
            value: values[name],
            onChange: (event) => updateValue(name, event.target.value),
            onBlur: handleBlur,
            disabled: submitting,
            "aria-invalid": touched[name] && errors[name] ? true : undefined,
            "aria-describedby": touched[name] && errors[name]
                ? `product-${name}-error`
                : undefined
        };
    }

    const categoriesReady = categoryState.status === "success" && categoryState.categories.length > 0;

    return (
        <section className={styles.page}>
            <Link
                to={isEditing ? `/admin/productos/${encodeURIComponent(product.id)}` : "/admin/productos"}
                className={styles.back}
            >
                <ArrowLeft size={16} aria-hidden="true" />
                {isEditing ? "Volver al producto" : "Volver a productos"}
            </Link>

            <header>
                <h1>{isEditing ? "Editar producto" : "Nuevo producto"}</h1>
                <p className={styles.subtitle}>
                    {isEditing
                        ? "Actualice la información paso a paso."
                        : "Complete el formulario paso a paso."}
                </p>
            </header>

            <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate>
                <StepProgress steps={STEPS} currentStep={currentStep} label="Pasos del producto" />

                <fieldset className={styles.section} disabled={submitting}>
                    <legend
                        ref={stepHeadingRef}
                        tabIndex={-1}
                        className={styles.stepHeading}
                    >
                        Paso {currentStep + 1} de {STEPS.length}: {STEPS[currentStep].title}
                    </legend>
                    <p className={styles.required}>Los campos marcados con * son obligatorios.</p>

                    {currentStep === 0 && (
                        <>
                            <div className={styles.field}>
                                <label htmlFor="product-name">Nombre *</label>
                                <input
                                    type="text"
                                    maxLength={LIMITS.name.max}
                                    placeholder="Ej.: Harina de trigo"
                                    required
                                    {...fieldProps("name")}
                                />
                                {renderFieldError("name")}
                                <p className={styles.hint}>Entre 3 y 120 caracteres.</p>
                            </div>

                            <div className={styles.field}>
                                <label htmlFor="product-categoryId">Categoría *</label>
                                {categoryState.status === "loading" && (
                                    <p className={styles.hint} role="status">Cargando categorías…</p>
                                )}
                                {categoryState.status === "error" && (
                                    <div className={styles.categoryError}>
                                        <p>No se pudieron cargar las categorías. {categoryState.error?.message}</p>
                                        <RetryButton
                                            onClick={() => {
                                                setCategoryState({ status: "loading", categories: [], error: null });
                                                setCategoryReloadKey((key) => key + 1);
                                            }}
                                        />
                                    </div>
                                )}
                                {categoryState.status === "success" && categoryState.categories.length === 0 && (
                                    <p className={styles.hint} role="status">No hay categorías registradas.</p>
                                )}
                                {categoryState.status === "success" && categoryState.categories.length > 0 && (
                                    <>
                                        <select required {...fieldProps("categoryId")}>
                                            <option value="">Seleccione una categoría</option>
                                            {categoryState.categories.map((category) => (
                                                <option key={category.id} value={category.id}>
                                                    {category.name}
                                                </option>
                                            ))}
                                        </select>
                                        {renderFieldError("categoryId")}
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {currentStep === 1 && (
                        <>
                            <div className={styles.field}>
                                <label htmlFor="product-brand">Marca</label>
                                <input type="text" maxLength={LIMITS.brand.max} {...fieldProps("brand")} />
                                {renderFieldError("brand")}
                                <p className={styles.hint}>Opcional, hasta 60 caracteres.</p>
                            </div>

                            <div className={styles.field}>
                                <label htmlFor="product-description">Descripción</label>
                                <textarea
                                    rows={4}
                                    maxLength={LIMITS.description.max}
                                    placeholder="Detalles del producto"
                                    {...fieldProps("description")}
                                />
                                {renderFieldError("description")}
                                <p className={styles.hint}>Opcional, hasta 1000 caracteres.</p>
                            </div>

                            <div className={styles.grid}>
                                <div className={styles.field}>
                                    <label htmlFor="product-weight">Peso</label>
                                    <input type="text" maxLength={LIMITS.weight.max} placeholder="Ej.: 500 g" {...fieldProps("weight")} />
                                    {renderFieldError("weight")}
                                    <p className={styles.hint}>Opcional, hasta 40 caracteres.</p>
                                </div>

                                <div className={styles.field}>
                                    <label htmlFor="product-size">Tamaño</label>
                                    <input type="text" maxLength={LIMITS.size.max} placeholder="Ej.: 24 cm" {...fieldProps("size")} />
                                    {renderFieldError("size")}
                                    <p className={styles.hint}>Opcional, hasta 40 caracteres.</p>
                                </div>
                            </div>

                            <div className={styles.field}>
                                <label htmlFor="product-imageUrl">Enlace de la imagen</label>
                                <input
                                    type="url"
                                    inputMode="url"
                                    maxLength={LIMITS.imageUrl.max}
                                    placeholder="https://…"
                                    {...fieldProps("imageUrl")}
                                />
                                {renderFieldError("imageUrl")}
                                <p className={styles.hint}>Opcional. Pegue un enlace HTTP o HTTPS de hasta 500 caracteres.</p>
                            </div>
                        </>
                    )}

                    {currentStep === 2 && (
                        <>
                            <div className={styles.field}>
                                <label htmlFor="product-price">Precio en colones *</label>
                                <div className={styles.prefixed}>
                                    <span className={styles.prefix}>₡</span>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={LIMITS.price.min}
                                        max={LIMITS.price.max}
                                        step="1"
                                        placeholder="Ej.: 2500"
                                        required
                                        {...fieldProps("price")}
                                    />
                                </div>
                                {renderFieldError("price")}
                                <p className={styles.hint}>
                                    {values.price && Number.isInteger(Number(values.price))
                                        ? formatPrice(Number(values.price))
                                        : "Ingrese un monto entero entre ₡1 y ₡10.000.000."}
                                </p>
                            </div>

                            <div className={styles.field}>
                                <label htmlFor="product-available">Disponibilidad *</label>
                                <select
                                    id="product-available"
                                    name="available"
                                    value={values.available ? "true" : "false"}
                                    onChange={(event) => updateValue("available", event.target.value === "true")}
                                    onBlur={handleBlur}
                                    disabled={submitting}
                                    aria-invalid={touched.available && errors.available ? true : undefined}
                                    aria-describedby={touched.available && errors.available
                                        ? "product-available-error"
                                        : undefined}
                                >
                                    <option value="true">Disponible</option>
                                    <option value="false">Agotado</option>
                                </select>
                                {renderFieldError("available")}
                            </div>
                        </>
                    )}
                </fieldset>

                {serverError && (
                    <div className={styles.serverError} role="alert">
                        <CircleAlert size={18} aria-hidden="true" />
                        {serverError}
                    </div>
                )}

                <div className={styles.actions}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate(
                            isEditing
                                ? `/admin/productos/${encodeURIComponent(product.id)}`
                                : "/admin/productos"
                        )}
                        disabled={submitting}
                    >
                        <X size={18} aria-hidden="true" />
                        Cancelar
                    </button>
                    <div className={styles.stepActions}>
                        {currentStep > 0 && (
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handlePrevious}
                                disabled={submitting}
                            >
                                <ArrowLeft size={18} aria-hidden="true" />
                                Anterior
                            </button>
                        )}
                        {currentStep < STEPS.length - 1 ? (
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={submitting || (currentStep === 0 && !categoriesReady)}
                            >
                                Continuar
                                <ArrowRight size={18} aria-hidden="true" />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={submitting || !categoriesReady || nothingToSave}
                            >
                                {submitting ? (
                                    <LoaderCircle size={18} className={styles.spin} aria-hidden="true" />
                                ) : (
                                    <Save size={18} aria-hidden="true" />
                                )}
                                {submitting
                                    ? "Guardando…"
                                    : isEditing
                                        ? "Guardar cambios"
                                        : "Guardar producto"}
                            </button>
                        )}
                    </div>
                </div>
                {nothingToSave && (
                    <p className={styles.noChanges} role="status">
                        No hay cambios para guardar.
                    </p>
                )}
            </form>
        </section>
    );
}

export default ProductCreate;
