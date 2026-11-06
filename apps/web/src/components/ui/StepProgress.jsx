import styles from "./StepProgress.module.css";

export default function StepProgress({ steps, currentStep, label }) {
    return (
        <ol className={styles.stepper} aria-label={label}>
            {steps.map((step, index) => (
                <li key={step.title} className={index === currentStep ? styles.activeStep : ""}
                    aria-current={index === currentStep ? "step" : undefined}>
                    <span className={styles.stepNumber}>{index + 1}</span>
                    <span className={styles.stepText}>
                        <strong>{step.title}</strong>
                        {step.description && <small>{step.description}</small>}
                    </span>
                </li>
            ))}
        </ol>
    );
}
