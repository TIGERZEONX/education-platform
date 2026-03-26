import React from "react";
import "../styles/index.css";

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function GlassCard({ title, children, className = "" }: CardProps) {
  return (
    <div className={`glass-panel animate-fade-in ${className}`}>
      {title && <h3 style={{ marginBottom: "16px", color: "var(--text-primary)" }}>{title}</h3>}
      {children}
    </div>
  );
}

export function InteractiveButton({
  label,
  onClick,
  variant = "default",
  disabled = false,
  className = "",
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  const getVariantClass = () => {
    switch (variant) {
      case "primary": return "btn-primary";
      case "danger": return "btn-danger";
      default: return "";
    }
  };

  return (
    <button
      className={`btn ${getVariantClass()} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
