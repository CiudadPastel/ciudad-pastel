import { COURSE_STATUS } from "../constants/course";

/**
 * Datos de prueba para la administración de cursos.
 * Estructura basada en buildCourse() del backend (Justin).
 * PENDIENTE: confirmar con el cliente.
 *
 * {
 *   id: string,
 *   name: string,
 *   summary: string,              // resumen corto para tarjetas y listas
 *   description: string,          // texto completo
 *   imageUrl: string | null,
 *   learningOutcomes: string[],   // lo que aprenderá el estudiante
 *   requiredMaterials: string[],  // lo que debe traer el estudiante
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
        status: COURSE_STATUS.ARCHIVED,
        createdAt: "2026-10-04T13:45:00Z",
        updatedAt: "2026-10-05T09:20:00Z"
    }
];
