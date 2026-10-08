import { useState } from "react";
import { CircleAlert, Plus, Trash2 } from "lucide-react";

import styles from "./ListEditor.module.css";

/**
 * Editor de una lista de textos (agregar y eliminar elementos).
 *   id, label, hint, placeholder: textos del campo
 *   items: arreglo de strings
 *   onChange(nuevoArreglo)
 *   maxItems, maxLength: límites
 */
function ListEditor({
    id,
    label,
    hint,
    placeholder,
    items,
    onChange,
    maxItems = 20,
    maxLength = 150,
    disabled = false,
    emptyText = "Todavía no hay elementos."
}) {
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");

    function addItem() {
        const value = draft.trim();

        if (!value) {
            setError("Escriba un texto antes de agregarlo.");
            return;
        }
        if (items.some((item) => item.toLowerCase() === value.toLowerCase())) {
            setError("Ese elemento ya está en la lista.");
            return;
        }
        if (items.length >= maxItems) {
            setError(`Puede agregar como máximo ${maxItems} elementos.`);
            return;
        }

        onChange([...items, value]);
        setDraft("");
        setError("");
    }

    function removeItem(index) {
        onChange(items.filter((_, i) => i !== index));
    }

    function handleKeyDown(event) {
        // Enter agrega el elemento en vez de enviar todo el formulario
        if (event.key === "Enter") {
            event.preventDefault();
            addItem();
        }
    }

    return (
        <div className={styles.wrap}>
            <label htmlFor={id} className={styles.label}>
                {label}
            </label>
            {hint && (
                <p id={`${id}-hint`} className={styles.hint}>
                    {hint}
                </p>
            )}

            <div className={styles.addRow}>
                <input
                    id={id}
                    type="text"
                    value={draft}
                    maxLength={maxLength}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={(e) => {
                        setDraft(e.target.value);
                        if (error) setError("");
                    }}
                    onKeyDown={handleKeyDown}
                    aria-describedby={`${id}-hint ${id}-error`}
                    aria-invalid={error ? true : undefined}
                />
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={addItem}
                    disabled={disabled}
                >
                    <Plus size={18} aria-hidden="true" />
                    Agregar
                </button>
            </div>

            {error && (
                <p id={`${id}-error`} className={styles.error} role="alert">
                    <CircleAlert size={14} aria-hidden="true" />
                    {error}
                </p>
            )}

            {items.length === 0 ? (
                <p className={styles.empty}>{emptyText}</p>
            ) : (
                <ul className={styles.list} aria-label={label}>
                    {items.map((item, index) => (
                        <li key={item} className={styles.item}>
                            <span className={styles.number} aria-hidden="true">
                                {index + 1}
                            </span>
                            <span className={styles.text}>{item}</span>
                            <button
                                type="button"
                                className={styles.remove}
                                onClick={() => removeItem(index)}
                                disabled={disabled}
                                aria-label={`Eliminar "${item}"`}
                                title="Eliminar"
                            >
                                <Trash2 size={16} aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <p className={styles.counter}>
                {items.length} de {maxItems}
            </p>
        </div>
    );
}

export default ListEditor;
