export const COURSE_STEPS = [
    { title: "Información e imagen", fields: ["name", "courseType", "summary", "description", "imageUrl"] },
    { title: "Contenido", fields: ["learningOutcomes", "whatYouWillLearn", "requiredMaterials", "materialsNote", "prerequisites"] },
    { title: "Lugar y planificación", fields: ["location", "address", "instructor", "capacity", "price", "reservationAmount", "priceNote"] },
    { title: "Horario", fields: ["scheduleType", "scheduleWeekday", "scheduleSessions", "scheduleStartDate", "scheduleStartTime", "scheduleEndTime", "scheduleNote"] },
    { title: "Revisión", fields: [] }
];

export function courseStepForField(field) {
    return Math.max(0, COURSE_STEPS.findIndex((step) => step.fields.includes(field)));
}
