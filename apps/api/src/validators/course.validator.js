import { COURSE_TYPE, SCHEDULE_FREQUENCY, WEEKDAY } from "../models/course.model.js";

const COURSE_LIMITS = {
  name: {
    min: 3,
    max: 120,
  },

  summary: {
    min: 10,
    max: 240,
  },

  description: {
    min: 20,
    max: 5000,
  },

  learningOutcomes: {
    maxItems: 15,
    maxLength: 200,
  },

  requiredMaterials: {
    maxItems: 30,
    maxLength: 150,
  },

  // Planning data (HU-A02). Price is a whole number of Costa Rican colones.
  capacity: {
    min: 1,
  },

  price: {
    min: 0,
  },

  instructor: {
    min: 3,
    max: 120,
  },

  optionalText: { min: 1, max: 5000 },
  location: { min: 1, max: 240 },
  address: { min: 1, max: 1000 },
};

// Validates a required string and returns its trimmed value.
function validateRequiredString(
  value,
  fieldName,
  minLength,
  maxLength,
  errors,
) {
  if (typeof value !== "string") {
    errors.push(`${fieldName} must be a string.`);

    return "";
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length < minLength) {
    errors.push(`${fieldName} must contain at least ${minLength} characters.`);
  }

  if (normalizedValue.length > maxLength) {
    errors.push(`${fieldName} must not exceed ${maxLength} characters.`);
  }

  return normalizedValue;
}

// Validates an optional HTTP or HTTPS image URL.
function validateOptionalUrl(value, errors) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    errors.push("imageUrl must be a string or null.");

    return null;
  }

  const normalizedUrl = value.trim();

  try {
    const url = new URL(normalizedUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      errors.push("imageUrl must use HTTP or HTTPS.");

      return null;
    }

    return normalizedUrl;
  } catch {
    errors.push("imageUrl must be a valid URL.");

    return null;
  }
}

// Validates and normalizes an optional array of strings.
function validateStringArray(
  value,
  fieldName,
  maxItems,
  maxItemLength,
  errors,
) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    errors.push(`${fieldName} must be an array.`);

    return [];
  }

  if (value.length > maxItems) {
    errors.push(`${fieldName} must not contain more than ${maxItems} items.`);
  }

  const normalizedValues = [];

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${fieldName}[${index}] must be a string.`);

      return;
    }

    const normalizedItem = item.trim();

    if (!normalizedItem) {
      errors.push(`${fieldName}[${index}] must not be empty.`);

      return;
    }

    if (normalizedItem.length > maxItemLength) {
      errors.push(
        `${fieldName}[${index}] must not exceed ${maxItemLength} characters.`,
      );

      return;
    }

    normalizedValues.push(normalizedItem);
  });

  return normalizedValues;
}

// Validates an optional integer without an arbitrary upper bound.
function validateOptionalInteger(value, fieldName, min, errors) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value)) {
    errors.push(`${fieldName} must be a whole number.`);

    return null;
  }

  if (value < min) {
    errors.push(`${fieldName} must be at least ${min}.`);

    return null;
  }

  return value;
}

// Validates an optional string; empty values are stored as null.
function validateOptionalString(
  value,
  fieldName,
  minLength,
  maxLength,
  errors,
) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  return validateRequiredString(value, fieldName, minLength, maxLength, errors);
}

// Checks that a value is a real calendar date in YYYY-MM-DD format.
function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

// Validates a required time of day in 24-hour HH:mm format (e.g. "13:00").
function validateTime(value, fieldName, errors) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    errors.push(`${fieldName} must be a valid time in HH:mm format.`);

    return null;
  }

  return value;
}

// Validates the optional schedule object of a course.
function validateSchedule(value, errors) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    errors.push("schedule must be an object.");

    return null;
  }

  let startDate = null;

  if (!isValidIsoDate(value.startDate)) {
    errors.push(
      "schedule.startDate must be a valid date in YYYY-MM-DD format.",
    );
  } else {
    startDate = value.startDate;
  }

  let endDate = null;

  if (
    value.endDate !== undefined &&
    value.endDate !== null &&
    value.endDate !== ""
  ) {
    if (!isValidIsoDate(value.endDate)) {
      errors.push(
        "schedule.endDate must be a valid date in YYYY-MM-DD format.",
      );
    } else if (startDate && value.endDate < startDate) {
      errors.push(
        "schedule.endDate must not be earlier than schedule.startDate.",
      );
    } else {
      endDate = value.endDate;
    }
  }

  const startTime = validateTime(
    value.startTime,
    "schedule.startTime",
    errors,
  );
  const endTime = validateTime(
    value.endTime,
    "schedule.endTime",
    errors,
  );

  if (startTime && endTime && endTime <= startTime) {
    errors.push("schedule.endTime must be later than schedule.startTime.");
  }

  const frequency = validateEnum(value.frequency, "schedule.frequency", SCHEDULE_FREQUENCY, errors, true);
  const weekday = validateEnum(value.weekday, "schedule.weekday", WEEKDAY, errors,
    frequency === SCHEDULE_FREQUENCY.WEEKLY);
  if (frequency === SCHEDULE_FREQUENCY.WEEKLY && endDate === null) {
    errors.push("schedule.endDate is required for a weekly course.");
  }
  const scheduleNote = validateOptionalString(value.scheduleNote, "schedule.scheduleNote",
    COURSE_LIMITS.optionalText.min, COURSE_LIMITS.optionalText.max, errors);

  return { startDate, endDate, startTime, endTime, frequency, weekday, scheduleNote };
}

// Enum values are stable API identifiers, not free text.
function validateEnum(value, fieldName, values, errors, required = false) {
  if (value == null && !required) return null;
  if (!Object.values(values).includes(value)) {
    errors.push(fieldName + " must be one of: " + Object.values(values).join(", ") + ".");
    return null;
  }
  return value;
}

// Validates and normalizes the data required to create a course.
export function validateCourseInput(input = {}) {
  const errors = [];

  const name = validateRequiredString(
    input.name,
    "name",
    COURSE_LIMITS.name.min,
    COURSE_LIMITS.name.max,
    errors,
  );

  const summary = validateRequiredString(
    input.summary,
    "summary",
    COURSE_LIMITS.summary.min,
    COURSE_LIMITS.summary.max,
    errors,
  );

  const description = validateRequiredString(
    input.description,
    "description",
    COURSE_LIMITS.description.min,
    COURSE_LIMITS.description.max,
    errors,
  );

  const imageUrl = validateOptionalUrl(input.imageUrl, errors);

  const learningOutcomes = validateStringArray(
    input.learningOutcomes,
    "learningOutcomes",
    COURSE_LIMITS.learningOutcomes.maxItems,
    COURSE_LIMITS.learningOutcomes.maxLength,
    errors,
  );

  const requiredMaterials = validateStringArray(
    input.requiredMaterials,
    "requiredMaterials",
    COURSE_LIMITS.requiredMaterials.maxItems,
    COURSE_LIMITS.requiredMaterials.maxLength,
    errors,
  );

  const capacity = validateOptionalInteger(
    input.capacity,
    "capacity",
    COURSE_LIMITS.capacity.min,
    errors,
  );

  const price = validateOptionalInteger(
    input.price,
    "price",
    COURSE_LIMITS.price.min,
    errors,
  );

  const instructor = validateOptionalString(
    input.instructor,
    "instructor",
    COURSE_LIMITS.instructor.min,
    COURSE_LIMITS.instructor.max,
    errors,
  );

  const schedule = validateSchedule(input.schedule, errors);
  const courseType = validateEnum(input.courseType, "courseType", COURSE_TYPE, errors);
  const reservationAmount = validateOptionalInteger(input.reservationAmount, "reservationAmount", 0, errors);
  const textFields = ["whatYouWillLearn", "location", "address", "materialsNote", "prerequisites", "priceNote"];
  const optionalText = Object.fromEntries(textFields.map((field) => {
    const limits = COURSE_LIMITS[field] ?? COURSE_LIMITS.optionalText;
    return [field, validateOptionalString(input[field], field, limits.min, limits.max, errors)];
  }));

  return {
    valid: errors.length === 0,

    errors,

    data: {
      name,
      summary,
      description,
      imageUrl,
      learningOutcomes,
      requiredMaterials,
      ...optionalText,
      courseType,
      reservationAmount,
      capacity,
      price,
      instructor,
      schedule,
    },
  };
}
