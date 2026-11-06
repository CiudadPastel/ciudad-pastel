export default function ResultsCount({ shown, total, noun = "productos", page, pageSize }) {
    if (!Number.isInteger(total) || total < 0) return null;
    const end = page ? Math.min(page * pageSize, total) : Math.min(shown, total);
    const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    return (
        <p role="status" style={{ color: "var(--cp-muted)", textAlign: "center", fontSize: "0.9rem" }}>
            Mostrando {page && total > 0 ? `${start}–${end}` : end} de {total} {noun}
        </p>
    );
}
