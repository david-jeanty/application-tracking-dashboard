export type ApplicationActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialApplicationState: ApplicationActionState = {
  status: "idle",
};
