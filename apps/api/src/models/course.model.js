export const COURSE_STATUS = Object.freeze({
    DRAFT: "draft",
    PUBLISHED: "published",
    ARCHIVED: "archived"
});

export const COURSE_TYPE = Object.freeze({
    BASIC: "basic",
    WORKSHOP: "workshop",
    DEMONSTRATIVE: "demonstrative",
    SEMI_DEMONSTRATIVE: "semi_demonstrative",
    MULTI_WEEK: "multi_week",
    OTHER: "other"
});

export const SCHEDULE_FREQUENCY = Object.freeze({ SINGLE: "single", WEEKLY: "weekly" });

export const WEEKDAY = Object.freeze({
    MONDAY: "monday",
    TUESDAY: "tuesday",
    WEDNESDAY: "wednesday",
    THURSDAY: "thursday",
    FRIDAY: "friday",
    SATURDAY: "saturday",
    SUNDAY: "sunday"
});

// Normalize reads without rewriting legacy Firestore documents.
export function normalizeSchedule(schedule) {
    if (schedule == null) return null;
    return {
        startDate: schedule.startDate ?? null,
        endDate: schedule.endDate ?? null,
        startTime: schedule.startTime ?? null,
        endTime: schedule.endTime ?? null,
        frequency: schedule.frequency ?? null,
        weekday: schedule.weekday ?? null,
        scheduleNote: schedule.scheduleNote === undefined
            ? (schedule.description ?? null)
            : schedule.scheduleNote
    };
}

// Creates a normalized course object with its default values.
export function buildCourse(data) {
    return {
        name: data.name,
        summary: data.summary,
        description: data.description,
        imageUrl: data.imageUrl ?? null,
        learningOutcomes: data.learningOutcomes ?? [],
        requiredMaterials: data.requiredMaterials ?? [],
        courseType: data.courseType ?? null,
        whatYouWillLearn: data.whatYouWillLearn ?? null,
        location: data.location ?? null,
        address: data.address ?? null,
        materialsNote: data.materialsNote ?? null,
        prerequisites: data.prerequisites ?? null,
        reservationAmount: data.reservationAmount ?? null,
        priceNote: data.priceNote ?? null,
        capacity: data.capacity ?? null,
        price: data.price ?? null,
        instructor: data.instructor ?? null,
        schedule: data.schedule ?? null,
        status: COURSE_STATUS.DRAFT
    };
}