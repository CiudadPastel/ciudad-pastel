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
 *   courseType: "basic" | "workshop" | "demonstrative" | "semi_demonstrative"
 *               | "multi_week" | "other" | null,
 *   whatYouWillLearn, materialsNote, prerequisites, location, address,
 *   priceNote: string | null,     // textos libres opcionales
 *   capacity: integer | null,     // 1 o más, sin máximo
 *   price: integer | null,        // colones enteros; obligatorio para publicar (0 = gratis)
 *   reservationAmount: integer | null,
 *   instructor: string | null,
 *   schedule: null | {
 *     startDate: string,          // YYYY-MM-DD
 *     endDate: string | null,     // obligatorio si es semanal
 *     startTime: string,          // HH:mm, ej. "13:00"
 *     endTime: string,
 *     frequency: "single" | "weekly",
 *     weekday: "monday" … "sunday" | null,
 *     scheduleNote: string | null
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
        courseType: "multi_week",
        whatYouWillLearn: null,
        materialsNote: null,
        prerequisites: null,
        location: "Ciudad Pastel — Florencia",
        address: null,
        reservationAmount: 10000,
        priceNote: null,
        capacity: 6,
        price: 45000,
        instructor: "María Vargas",
        schedule: {
            startDate: "2026-11-07",
            endDate: "2026-11-28",
            startTime: "09:00",
            endTime: "12:00",
            frequency: "weekly",
            weekday: "saturday",
            scheduleNote: null
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
        courseType: null,
        whatYouWillLearn: null,
        materialsNote: null,
        prerequisites: null,
        location: null,
        address: null,
        reservationAmount: null,
        priceNote: null,
        capacity: 10,
        price: 0,
        instructor: "Carlos Solís",
        schedule: {
            startDate: "2026-11-10",
            endDate: null,
            startTime: "14:00",
            endTime: "17:00",
            frequency: "single",
            weekday: null,
            scheduleNote: null
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
        courseType: null,
        whatYouWillLearn: null,
        materialsNote: null,
        prerequisites: null,
        location: null,
        address: null,
        reservationAmount: null,
        priceNote: null,
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
        courseType: null,
        whatYouWillLearn: null,
        materialsNote: null,
        prerequisites: null,
        location: null,
        address: null,
        reservationAmount: null,
        priceNote: null,
        capacity: null,
        price: null,
        instructor: null,
        schedule: null,
        status: COURSE_STATUS.ARCHIVED,
        createdAt: "2026-10-04T13:45:00Z",
        updatedAt: "2026-10-05T09:20:00Z"
    }
];
