/**
 * Datos de prueba para la administración de cursos.
 * Estructura PROVISIONAL: confirmar nombres de campos con backend (CIU-22).
 *
 * {
 *   id: string,
 *   name: string,
 *   description: string,
 *   instructor: string,
 *   schedule: string,        // texto libre, ej. "Sábados, 9:00 a. m. – 12:00 m. d."
 *   startDate: string,       // ISO "YYYY-MM-DD"
 *   price: number,           // colones
 *   capacity: number,        // cupo total
 *   enrolledCount: number,   // matriculados confirmados
 *   isPublished: boolean,
 *   createdAt: string,       // ISO
 *   updatedAt: string        // ISO
 * }
 */
export const mockCourses = [
    {
        id: "c-001",
        name: "Repostería básica",
        description:
            "Bizcochos, rellenos y coberturas esenciales. Ideal para quienes empiezan desde cero.",
        instructor: "Yamilena Blanco Chaves",
        schedule: "Sábados, 9:00 a. m. – 12:00 m. d.",
        startDate: "2026-10-17",
        price: 45000,
        capacity: 12,
        enrolledCount: 8,
        isPublished: true,
        createdAt: "2026-09-20T15:00:00Z",
        updatedAt: "2026-10-01T18:30:00Z"
    },
    {
        id: "c-002",
        name: "Panadería artesanal",
        description:
            "Masas madre, panes de molde y panes dulces tradicionales costarricenses.",
        instructor: "Yamilena Blanco Chaves",
        schedule: "Martes y jueves, 6:00 p. m. – 8:30 p. m.",
        startDate: "2026-10-27",
        price: 60000,
        capacity: 10,
        enrolledCount: 10,
        isPublished: true,
        createdAt: "2026-09-22T16:10:00Z",
        updatedAt: "2026-10-03T14:05:00Z"
    },
    {
        id: "c-003",
        name: "Decoración con fondant",
        description:
            "Forrado de queques, figuras modeladas y acabados para eventos.",
        instructor: "Instructora invitada",
        schedule: "Domingos, 1:00 p. m. – 5:00 p. m.",
        startDate: "2026-11-08",
        price: 52000,
        capacity: 8,
        enrolledCount: 0,
        isPublished: false,
        createdAt: "2026-10-02T20:00:00Z",
        updatedAt: "2026-10-02T20:00:00Z"
    },
    {
        id: "c-004",
        name: "Postres navideños",
        description:
            "Queque navideño, galletas decoradas y rompope para la temporada.",
        instructor: "Yalena Chacón Blanco",
        schedule: "Sábado 6 de diciembre, 8:00 a. m. – 2:00 p. m.",
        startDate: "2026-12-06",
        price: 35000,
        capacity: 15,
        enrolledCount: 0,
        isPublished: false,
        createdAt: "2026-10-04T13:45:00Z",
        updatedAt: "2026-10-05T09:20:00Z"
    }
];
