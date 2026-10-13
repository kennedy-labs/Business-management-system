import axios from "axios";
import { useAuthStore } from "@/store/useAuthStore";

const apiBaseURL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

const api = axios.create({
  baseURL: apiBaseURL,
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const authState = useAuthStore.getState();
    const token = authState.token;
    const businessId = authState.user?.businessId || authState.business?.id;

    if (token && !config.headers["Authorization"]) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    if (businessId && !config.headers["x-business-id"]) {
      config.headers["x-business-id"] = businessId;
    }
    if (authState.user?.id && !config.headers["x-user-id"]) {
      config.headers["x-user-id"] = authState.user.id;
    }
  }
  return config;
});

export default api;
