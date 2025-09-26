import { Component, ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };

export default class ErrorBoundary extends Component<Props, { hasError: boolean }> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    // Opcional: enviar a logs
    console.error("UI ErrorBoundary atrapó:", err);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(239,68,68,.10)",
            color: "#fecaca",
          }}
        >
          Ocurrió un error al mostrar el resultado. Intenta de nuevo o cambia la
          selección. (Revisa la consola del navegador para más detalle).
        </div>
      );
    }
    return this.props.children;
  }
}
