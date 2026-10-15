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
    max: 8,
  },

  price: {
    min: 0,
    max: 10000000,
  },

  instructor: {
    min: 3,
    max: 120,
  },

  scheduleDescription: {
    min: 3,
    max: 200,
  },
};

// Planning fields that must be complete before a course is published.
export const PLANNING_FIELDS = Object.freeze([
  "capacity",
  "schedule",
  "price",
  "instructor",
]);

// Returns the planning fields that are still empty in a course.
export function getMissingPlanningFields(course) {
  return PLANNING_FIELDS.filter(
    (field) => course?.[field] === undefined || course?.[field] === null,
  );
}

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

// Validates an optional whole number inside an inclusive range.
function validateOptionalInteger(value, fieldName, min, max, errors) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value)) {
    errors.push(`${fieldName} must be a whole number.`);

    return null;
  }

  if (value < min || value > max) {
    errors.push(`${fieldName} must be between ${min} and ${max}.`);

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

// Validates an optional time of day in 24-hour HH:mm format (e.g. "13:00").
function validateOptionalTime(value, fieldName, errors) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

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

  const startTime = validateOptionalTime(
    value.startTime,
    "schedule.startTime",
    errors,
  );
  const endTime = validateOptionalTime(
    value.endTime,
    "schedule.endTime",
    errors,
  );

  if (startTime && endTime && endTime <= startTime) {
    errors.push("schedule.endTime must be later than schedule.startTime.");
  }

  const description = validateRequiredString(
    value.description,
    "schedule.description",
    COURSE_LIMITS.scheduleDescription.min,
    COURSE_LIMITS.scheduleDescription.max,
    errors,
  );

  return {
    startDate,
    endDate,
    startTime,
    endTime,
    description,
  };
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
    COURSE_LIMITS.capacity.max,
    errors,
  );

  const price = validateOptionalInteger(
    input.price,
    "price",
    COURSE_LIMITS.price.min,
    COURSE_LIMITS.price.max,
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
      capacity,
      price,
      instructor,
      schedule,
    },
  };
}
