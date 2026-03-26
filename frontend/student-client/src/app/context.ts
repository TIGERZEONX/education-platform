import React from "react";
import type { StudentClientBootstrapContext } from "./bootstrap";

// Define a safe, empty default for the context so it can be mocked or initialized later
export const StudentContext = React.createContext<StudentClientBootstrapContext | null>(null);
