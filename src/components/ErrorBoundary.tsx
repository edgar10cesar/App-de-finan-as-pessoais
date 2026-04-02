import React from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Ocorreu um erro inesperado.";
      let isFirestoreError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            isFirestoreError = true;
            errorMessage = `Erro no Banco de Dados: ${parsed.error}`;
            if (parsed.error.includes('Missing or insufficient permissions')) {
              errorMessage = "Você não tem permissão para realizar esta ação ou acessar estes dados. Verifique se você está logado corretamente.";
            }
          }
        }
      } catch (e) {
        // Not a JSON error message
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4 text-center">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-zinc-100">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-4">Ops! Algo deu errado</h2>
            <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm mb-8 text-left break-words">
              {errorMessage}
            </div>
            <button
              onClick={this.handleReset}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold py-3 px-6 rounded-2xl transition-all flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              Tentar Novamente
            </button>
            {isFirestoreError && (
              <p className="mt-4 text-xs text-zinc-400">
                Se o problema persistir, pode ser necessário revisar as permissões de acesso.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
