import { Search, X } from "lucide-react";
import ResultsCount from "../ui/ResultsCount";
import { ADMIN_PAGE_SIZE } from "../../utils/adminList";
import styles from "./AdminListTools.module.css";

export function AdminListTools({ list, placeholder, orders, defaultOrder, disabled, children }) {
    const order = list.params.get("orden");
    return <div className={styles.tools}>
        <label className={styles.search}>
            <span>Buscar</span>
            <span className={styles.searchInput}>
                <Search size={18} aria-hidden="true" />
                <input type="search" value={list.query} maxLength={160} placeholder={placeholder}
                    onChange={(event) => list.setParam("q", event.target.value)} disabled={disabled} />
            </span>
        </label>
        {children}
        <label className={styles.field}><span>Ordenar por</span>
            <select value={orders.some(([value]) => value === order) ? order : defaultOrder}
                onChange={(event) => list.setParam("orden", event.target.value)} disabled={disabled}>
                {orders.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
        </label>
        <button type="button" className="btn btn-secondary" onClick={list.clear}>
            <X size={16} aria-hidden="true" /> Limpiar filtros
        </button>
    </div>;
}
export function AdminListSelect({ label, value, onChange, children, disabled }) {
    return <label className={styles.field}><span>{label}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>{children}</select>
    </label>;
}
export function AdminListDate({ label, value, onChange, min, max, disabled }) {
    return <label className={styles.field}><span>{label}</span>
        <input type="date" value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
    </label>;
}
export function AdminListPagination({ total, noun, pagination, onPage }) {
    return <div className={styles.pagination}>
        <ResultsCount shown={pagination.items.length} total={total} noun={noun} page={pagination.page} pageSize={ADMIN_PAGE_SIZE} />
        {pagination.pages > 1 && <nav aria-label={`Paginación de ${noun}`}>
            <button type="button" className="btn btn-secondary" disabled={pagination.page === 1} onClick={() => onPage(pagination.page - 1)}>Anterior</button>
            <span>Página {pagination.page} de {pagination.pages}</span>
            <button type="button" className="btn btn-secondary" disabled={pagination.page === pagination.pages} onClick={() => onPage(pagination.page + 1)}>Siguiente</button>
        </nav>}
    </div>;
}
