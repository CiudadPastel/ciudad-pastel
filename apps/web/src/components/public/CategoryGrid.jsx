import { useState } from "react";
import { ImageOff, LayoutGrid } from "lucide-react";
import { Link } from "react-router-dom";
import styles from "../../pages/public/ProductsList.module.css";

function CategoryCard({ category, to, icon: Icon }) {
    const [imageFailed, setImageFailed] = useState(false);
    return (
        <li className={styles.cardShell}>
            <Link to={to} className={styles.card}>
                {category.imageUrl && !imageFailed ? (
                    <img src={category.imageUrl} alt="" className={styles.image} loading="lazy"
                        onError={() => setImageFailed(true)} />
                ) : (
                    <div className={styles.imageEmpty} aria-hidden="true">
                        <Icon size={28} />
                    </div>
                )}
                <div className={styles.cardBody}><h2>{category.name}</h2></div>
            </Link>
        </li>
    );
}

export default function CategoryGrid({ categories, categoryUrl, label = "Categorías", categoryIcons }) {
    return (
        <ul className={styles.grid} aria-label={label}>
            {[{ id: null, name: "Ver todos" }, ...categories].map((category) => (
                <CategoryCard key={category.id ?? "all"} category={category} to={categoryUrl(category.id)}
                    icon={categoryIcons?.[category.id] ?? (category.id ? ImageOff : LayoutGrid)} />
            ))}
        </ul>
    );
}
