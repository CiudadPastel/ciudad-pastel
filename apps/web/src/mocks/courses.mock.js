import { COURSE_STATUS } from "../constants/course";

/**
 * Datos de prueba para la administración de cursos.
 * Estructura basada en buildCourse() del backend, incluida planificación HU-A02.
 *
 * {
 *   id: string,
 *   name: string,
 *   summary: string,              // resumen corto para tarjetas y listas
 *   description: string,          // texto completo
 *   imageUrl: string | null,
 *   learningOutcomes: string[],   // lo que aprenderá el estudiante
 *   requiredMaterials: string[],  // lo que debe traer el estudiante
 *   capacity: integer | null,    // de 1 a 100 personas
 *   price: integer | null,       // colones CRC enteros, de 0 a 10 000 000
 *   instructor: string | null,   // de 3 a 120 caracteres
 *   schedule: null | {
 *     startDate: string,          // YYYY-MM-DD
 *     endDate: string | null,     // YYYY-MM-DD, opcional
 *     description: string        // descripción del horario
 *   },
 *   status: "draft" | "published" | "archived",
 *   createdAt: string,            // ISO (lo agrega el backend)
 *   updatedAt: string             // ISO (lo agrega el backend)
 * }
 */
export const mockCourses = [
    {
        id: "c-001",
        name: "Repostería básica",
        summary: "Bizcochos, rellenos y coberturas esenciales para empezar desde cero.",
        description:
            "Un curso práctico para quienes nunca han horneado. Se trabaja paso a paso la preparación de bizcochos, rellenos clásicos y coberturas, con recetas pensadas para repetir en casa.",
        imageUrl: null,
        learningOutcomes: [
            "Preparar un bizcocho esponjoso",
            "Hacer rellenos de crema pastelera y dulce de leche",
            "Cubrir un queque con buttercream"
        ],
        requiredMaterials: ["Delantal", "Recipiente plástico con tapa", "Espátula"],
        capacity: 12,
        price: 45000,
        instructor: "María Vargas",
        schedule: {
            startDate: "2026-11-07",
            endDate: "2026-11-28",
            description: "Sábados de 9:00 a. m. a 12:00 m."
        },
        status: COURSE_STATUS.PUBLISHED,
        createdAt: "2026-09-20T15:00:00Z",
        updatedAt: "2026-10-01T18:30:00Z"
    },
    {
        id: "c-002",
        name: "Panadería artesanal",
        summary: "Masa madre, panes de molde y panes dulces tradicionales costarricenses.",
        description:
            "Aprenda los fundamentos de la panadería: fermentación, amasado y horneado. Incluye panes de molde, pan casero y panes dulces típicos.",
        imageUrl: null,
        learningOutcomes: [
            "Mantener y alimentar una masa madre",
            "Amasar y formar distintos tipos de pan"
        ],
        requiredMaterials: ["Delantal", "Paño de cocina"],
        capacity: 10,
        price: 0,
        instructor: "Carlos Solís",
        schedule: {
            startDate: "2026-11-10",
            endDate: null,
            description: "Martes de 2:00 p. m. a 5:00 p. m."
        },
        status: COURSE_STATUS.PUBLISHED,
        createdAt: "2026-09-22T16:10:00Z",
        updatedAt: "2026-10-03T14:05:00Z"
    },
    {
        id: "c-003",
        name: "Decoración con fondant",
        summary: "Forrado de queques, figuras modeladas y acabados para eventos.",
        description:
            "Técnicas de decoración profesional con fondant para cumpleaños, bodas y eventos especiales.",
        imageUrl: null,
        learningOutcomes: ["Forrar un queque con fondant", "Modelar figuras sencillas"],
        requiredMaterials: ["Rodillo", "Cúter de precisión"],
        capacity: 1,
        price: null,
        instructor: null,
        schedule: null,
        status: COURSE_STATUS.DRAFT,
        createdAt: "2026-10-02T20:00:00Z",
        updatedAt: "2026-10-02T20:00:00Z"
    },
    {
        id: "c-004",
        name: "Postres navideños",
        summary: "Queque navideño, galletas decoradas y rompope para la temporada.",
        description: "Recetas tradicionales para preparar y vender en la época navideña.",
        imageUrl: null,
        learningOutcomes: [],
        requiredMaterials: [],
        capacity: null,
        price: null,
        instructor: null,
        schedule: null,
        status: COURSE_STATUS.ARCHIVED,
        createdAt: "2026-10-04T13:45:00Z",
        updatedAt: "2026-10-05T09:20:00Z"
    }
];
