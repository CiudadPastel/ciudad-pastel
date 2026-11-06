import { useEffect, useRef, useState } from "react";
import { ImagePlus, Save, ExternalLink, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { DEFAULT_HOME_CONTENT, getAdminHomeContent, updateAdminHomeContent } from "../../services/homeContent.service";
import styles from "./HomeContent.module.css";

const FIELDS = [
    { key: "heroImageUrl", title: "Fotografía principal", note: "Recomendado: fotografía horizontal de al menos 1400 píxeles de ancho." },
    { key: "storeImageUrl", title: "Fotografía de la tienda", note: "Se muestra en el bloque editorial de Tienda." },
    { key: "aboutImageUrl", title: "Fotografía de Sobre nosotros", note: "Opcional. Aparece al lado de la historia del negocio." }
];

function ImagePreview({ file, url, title }) {
    const image = useRef(null);
    useEffect(() => {
        const local = file ? URL.createObjectURL(file) : null;
        image.current.src = local || url || "";
        return () => { if (local) URL.revokeObjectURL(local); };
    }, [file, url]);
    return <img ref={image} alt={`Vista previa: ${title}`} />;
}

export default function HomeContent() {
    const [content, setContent] = useState(DEFAULT_HOME_CONTENT);
    const [initial, setInitial] = useState(DEFAULT_HOME_CONTENT);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [files, setFiles] = useState({});
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        let alive = true;
        getAdminHomeContent().then(data => {
            if (alive) { setContent(data); setInitial(data); }
        }).catch(() => { if (alive) setError("No se pudo cargar el contenido. Intenta recargar la página."); })
          .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const getUrl = key => key === "aboutImageUrl" ? content.about.imageUrl || "" : content[key] || "";
    const updateUrl = (key, value) => {
        setFiles(prev => ({ ...prev, [key]: null }));
        setContent(prev => key === "aboutImageUrl" ? { ...prev, about: { ...prev.about, imageUrl: value || null } }
            : { ...prev, [key]: value || null });
    };

    function handleUpload(event, key) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (file.size <= 0 || file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            setError("Solo JPG, PNG o WebP de hasta 5 MiB."); return;
        }
        setError(""); setSuccess("");
        setFiles(prev => ({ ...prev, [key]: file }));
    }

    async function handleSave(event) {
        event.preventDefault(); setSaving(true); setError(""); setSuccess("");
        try {
            const saved = await updateAdminHomeContent(content, files);
            setContent(saved); setInitial(saved); setFiles({});
            setSuccess("Los cambios de la portada fueron publicados.");
        } catch (err) {
            setError(err?.details?.join(" ") || (err?.status === 409 ? "La portada cambió o este guardado ya fue recibido. Recarga la página antes de volver a guardar." : "No se pudo confirmar la publicación. Recarga para comprobar el resultado antes de reintentar."));
        } finally { setSaving(false); }
    }
    const busy = loading || saving;
    return <section className={styles.page}>
        <header className={styles.header}><div><p className={styles.eyebrow}>SITIO WEB</p><h1>Página de inicio</h1><p>Personaliza las fotografías y la historia de Ciudad Pastel, sin editar el código.</p></div><Link to="/" target="_blank" rel="noopener noreferrer" className="btn btn-secondary"><ExternalLink size={16}/> Ver portada</Link></header>
        {loading ? <p role="status">Cargando configuración…</p> :
        <form onSubmit={handleSave} className={styles.form}>
            {FIELDS.map(({ key, title, note }) => <fieldset className={styles.panel} key={key} disabled={busy}>
                <legend>{title}</legend>
                <p>{note}</p>
                <div className={styles.imageRow}>
                    {files[key] || getUrl(key) ? <ImagePreview file={files[key]} url={getUrl(key)} title={title} />
                        : <div className={styles.emptyImage}><ImagePlus size={30}/><span>Sin imagen seleccionada</span></div>}
                    <div className={styles.imageControls}>
                        <label htmlFor={key}>URL HTTPS directa de la imagen</label>
                        <input id={key} type="url" placeholder="https://..." value={getUrl(key)} onChange={event => updateUrl(key, event.target.value)} />
                        <label className={styles.uploadLabel} htmlFor={`upload-${key}`}><ImagePlus size={16}/> Seleccionar fotografía</label>
                        <input className={styles.hiddenFile} id={`upload-${key}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => handleUpload(event, key)} />
                        <button type="button" className={styles.clearButton} onClick={() => updateUrl(key, null)}>Quitar imagen</button>
                        <small>{files[key] ? `Seleccionada: ${files[key].name}. Se subirá y publicará al guardar. ` : ""}Se aceptan enlaces públicos directos. Los enlaces de vista previa de Drive pueden no funcionar.</small>
                    </div>
                </div>
            </fieldset>)}
            <fieldset className={styles.panel} disabled={busy}>
                <legend>Sobre nosotros</legend>
                <label className={styles.check}><input type="checkbox" checked={content.about.visible} onChange={event => setContent(prev => ({ ...prev, about: { ...prev.about, visible: event.target.checked } }))} /> Mostrar esta sección en la portada</label>
                <div className={styles.inputGroup}><label htmlFor="about-title">Título</label><input id="about-title" maxLength={100} value={content.about.title} onChange={event => setContent(prev => ({ ...prev, about: { ...prev.about, title: event.target.value } }))}/></div>
                <div className={styles.inputGroup}><label htmlFor="about-description">Historia y descripción</label><textarea id="about-description" rows={7} maxLength={2500} placeholder="Cuenta la historia del negocio con tus propias palabras..." value={content.about.description} onChange={event => setContent(prev => ({ ...prev, about: { ...prev.about, description: event.target.value } }))}/><small>{content.about.description.length} / 2500 caracteres</small></div>
            </fieldset>
            {error && <p className={styles.error} role="alert">{error}</p>}
            {success && <p className={styles.success} role="status">{success}</p>}
            <div className={styles.actions}><button disabled={busy} type="button" className="btn btn-secondary" onClick={() => { setContent(initial); setFiles({}); setError(""); setSuccess(""); }}><RotateCcw size={16}/> Descartar cambios</button><button disabled={busy} type="submit" className="btn btn-primary"><Save size={16}/> {saving ? "Guardando…" : "Guardar cambios"}</button></div>
        </form>}
    </section>;
}
