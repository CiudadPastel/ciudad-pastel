import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function useAdminList() {
    const [params, setParams] = useSearchParams();
    const query = params.get("q") ?? "";
    const [debounced, setDebounced] = useState(query);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(query), 300);
        return () => clearTimeout(timer);
    }, [query]);
    function setParam(name, value) {
        setParams((current) => {
            const next = new URLSearchParams(current);
            if (value) next.set(name, value);
            else next.delete(name);
            if (name !== "pagina") next.delete("pagina");
            return next;
        }, { replace: true });
    }
    function clear() {
        setParams((current) => {
            const next = new URLSearchParams(current);
            for (const name of ["q", "estado", "tipo", "curso", "categoria", "disponibilidad", "desde", "hasta", "orden", "pagina"]) next.delete(name);
            return next;
        }, { replace: true });
    }
    return { params, query, debounced, setParam, clear };
}
