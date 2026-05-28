/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Minus, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  LogOut, 
  PlusCircle, 
  Trash2, 
  Edit2,
  Calendar as CalendarIcon,
  PieChart as PieChartIcon,
  BarChart2,
  LayoutDashboard,
  History,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  X,
  Check,
  Search,
  FileText,
  Loader2,
  AlertCircle,
  Coffee,
  Bus,
  Sparkles,
  Send,
  User as UserIcon,
  Download
} from 'lucide-react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  getDocFromServer,
  updateDoc
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  LabelList
} from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, addMonths, isBefore, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';

import { TransactionModal } from './components/TransactionModal';
import { EcsLogo } from './components/EcsLogo';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Transaction {
  id: string;
  uid: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string; // Estabelecimento
  item?: string;       // Item adquirido
  date: string;
  createdAt: any;
  paymentMethod?: 'credit_card' | 'other' | 'vr' | 'vt';
  isInstallment?: boolean;
  totalInstallments?: number;
  paidInstallments?: number;
  currentInstallment?: number;
  billingCycle?: 'current' | 'next';
  billingMonth?: string; // Format: YYYY-MM
  bank?: string;
  updatedAt?: any;
  isPaid?: boolean;
}

const CATEGORIES = {
  income: ['Salário', 'Investimentos', 'Saldo Anterior', 'Presente', 'Outros'],
  expense: ['Alimentação', 'Transporte', 'Lazer', 'Saúde', 'Educação', 'Moradia', 'Doação', 'Poupança do filho', 'Fatura do Cartão', 'Despesas com o carro', 'Celular', 'Vestuário', 'Pet', 'Assinatura', 'Beleza', 'Saldo Anterior', 'Outros']
};

const COLORS = ['#2563eb', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "Algo deu errado. Por favor, recarregue a página.";
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) displayMessage = `Erro no Banco de Dados: ${parsed.error}`;
        }
      } catch (e) {
        // Not JSON
      }

      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">Ops! Ocorreu um erro</h2>
            <p className="text-zinc-600 mb-6">{displayMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all mb-4"
            >
              Recarregar Página
            </button>
            {this.state.error && (
              <details className="text-left mt-4 text-[10px] text-zinc-400 font-mono max-h-40 overflow-auto bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                <summary className="cursor-pointer font-bold text-zinc-500 hover:text-zinc-700 mb-1">Informações técnicas do erro</summary>
                <p className="whitespace-pre-wrap">{this.state.error.stack || this.state.error.message || String(this.state.error)}</p>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'credit_card' | 'vr' | 'vt'>('history');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isScanning, setIsScanning] = useState(false);
  const [selectedCategoryForDrillDown, setSelectedCategoryForDrillDown] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [ccSearchTerm, setCcSearchTerm] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showAllCC, setShowAllCC] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [bulkEditError, setBulkEditError] = useState<string | null>(null);
  const [bulkEditField, setBulkEditField] = useState<'category' | 'paymentMethod' | 'type' | 'date' | 'bank' | null>(null);
  const [bulkEditValue, setBulkEditValue] = useState<string>('');
  
  // CC Filter State
  const [showOnlyInstallments, setShowOnlyInstallments] = useState(false);
  const [ccFilterDate, setCcFilterDate] = useState('');
  const [ccFilterBank, setCcFilterBank] = useState('');
  const [ccFilterEstablishment, setCcFilterEstablishment] = useState('');
  const [ccFilterItem, setCcFilterItem] = useState('');
  const [ccFilterCategory, setCcFilterCategory] = useState('');
  
  // VR Filter State
  const [vrSearchTerm, setVrSearchTerm] = useState('');
  const [vrFilterDate, setVrFilterDate] = useState('');
  const [vrFilterEstablishment, setVrFilterEstablishment] = useState('');
  const [vrFilterItem, setVrFilterItem] = useState('');
  const [vrFilterCategory, setVrFilterCategory] = useState('');

  // VT Filter State
  const [vtSearchTerm, setVtSearchTerm] = useState('');
  const [vtFilterDate, setVtFilterDate] = useState('');
  const [vtFilterEstablishment, setVtFilterEstablishment] = useState('');
  const [vtFilterItem, setVtFilterItem] = useState('');
  const [vtFilterCategory, setVtFilterCategory] = useState('');

  // AI Consultant State
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isConsulting, setIsConsulting] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', parts: { text: string }[] }[]>([]);
  const [isChatActive, setIsChatActive] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Batch Scan State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const prevUserRef = useRef<User | null>(null);
  const [batchTransactions, setBatchTransactions] = useState<Partial<Transaction>[]>([]);
  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const isProcessingCarryOver = useRef(false);

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User installation prompt result: ${outcome}`);
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  // Clear AI advice when month/year changes
  useEffect(() => {
    setAiAdvice(null);
    setIsChatActive(false);
    setChatMessages([]);
  }, [selectedMonth, selectedYear]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (isChatActive) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatActive]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthError(null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Set form data when editing
  useEffect(() => {
    if (editingTransaction) {
      setIsAddModalOpen(true);
    }
  }, [editingTransaction]);

  // Welcome Modal Logic
  useEffect(() => {
    if (user && !prevUserRef.current && !loading) {
      setShowWelcomeModal(true);
    }
    prevUserRef.current = user;
  }, [user, loading]);

  // Firestore Listener
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const q = query(
      collection(db, 'transactions'),
      where('uid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      
      // Sort client-side to avoid index requirement
      txs.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateB.localeCompare(dateA);
      });
      
      setTransactions(txs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    return () => unsubscribe();
  }, [user]);

  // Automatic Balance Carry Over Logic
  useEffect(() => {
    if (!user || transactions.length === 0 || isProcessingCarryOver.current) return;

    const applyCarryOver = async () => {
      isProcessingCarryOver.current = true;
      try {
        const today = new Date();
        const currentRealMonthStart = startOfMonth(today);

        // Find the oldest transaction to know where to start
        const allDates = transactions
          .map(t => parseISO(t.date))
          .filter(d => !isNaN(d.getTime()))
          .sort((a, b) => a.getTime() - b.getTime());

        if (allDates.length === 0) return;

        let checkDate = startOfMonth(allDates[0]);
        // We start checking from the month AFTER the oldest month
        checkDate = addMonths(checkDate, 1);

        // Loop from the oldest month + 1 up to today (inclusive)
        while (isBefore(checkDate, addMonths(currentRealMonthStart, 1))) {
          const m = checkDate.getMonth();
          const y = checkDate.getFullYear();

          const methodsToCheck: ('other' | 'vr' | 'vt')[] = ['other', 'vr', 'vt'];

          for (const method of methodsToCheck) {
            // Check if a carry-over already exists for THIS month (m, y) for THIS method
            const carryOverExists = transactions.some(t => {
              const d = parseISO(t.date);
              return d.getMonth() === m && 
                     d.getFullYear() === y && 
                     t.description === "Saldo Transportado (Mês Anterior)" &&
                     t.category === "Saldo Anterior" &&
                     (method === 'other' ? (t.paymentMethod === 'other' || !t.paymentMethod) : t.paymentMethod === method);
            });

            if (!carryOverExists) {
              // Need to calculate previous month's balance for this method
              const prevMonthDate = subMonths(checkDate, 1);
              const pm = prevMonthDate.getMonth();
              const py = prevMonthDate.getFullYear();

              const prevMonthTxs = transactions.filter(t => {
                const d = parseISO(t.date);
                const matchesMethod = method === 'other' ? 
                  (!t.paymentMethod || t.paymentMethod === 'other') : 
                  t.paymentMethod === method;
                
                return d.getMonth() === pm && 
                       d.getFullYear() === py &&
                       matchesMethod;
              });

              // Calculate balance: Income - Expense
              const income = prevMonthTxs.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
              const expense = prevMonthTxs.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
              const balance = income - expense;

              // Only create if there's a balance to carry over
              if (Math.abs(balance) > 0.001) {
                const carryOverData = {
                  uid: user.uid,
                  amount: Math.abs(balance),
                  type: (balance > 0 ? 'income' : 'expense') as 'income' | 'expense',
                  category: 'Saldo Anterior',
                  description: 'Saldo Transportado (Mês Anterior)',
                  date: format(checkDate, 'yyyy-MM-01'),
                  createdAt: new Date().toISOString(),
                  paymentMethod: method
                };

                try {
                  await addDoc(collection(db, 'transactions'), carryOverData);
                  return; // Settle and wait for next snapshot
                } catch (e) {
                  console.error(`Erro ao criar saldo transportado (${method}):`, e);
                  break;
                }
              }
            }
          }

          checkDate = addMonths(checkDate, 1);
        }
      } finally {
        isProcessingCarryOver.current = false;
      }
    };

    const timer = setTimeout(applyCarryOver, 2000); // Wait 2s for all transactions to settle
    return () => clearTimeout(timer);
  }, [user, transactions.length]);

  // Connection Test
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        // Only log connection test errors, don't throw to avoid crashing the app
        console.warn("Teste de conexão falhou (esperado se o documento não existir):", error);
      }
    };
    testConnection();
  }, []);

  const handleAddClick = () => {
    setEditingTransaction(null);
    setIsAddModalOpen(true);
  };

  const handleEditClick = (t: Transaction) => {
    const originalId = t.id.split('-inst-')[0];
    const originalT = transactions.find(tx => tx.id === originalId) || t;
    setEditingTransaction(originalT);
    setIsAddModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setEditingTransaction(null);
  };

  const handleSaveTransaction = async (data: Partial<Transaction>) => {
    if (!user) return;

    const transactionData = {
      ...data,
      uid: user.uid,
      createdAt: editingTransaction ? editingTransaction.createdAt : new Date().toISOString(),
      updatedAt: serverTimestamp()
    };

    try {
      if (editingTransaction) {
        await updateDoc(doc(db, 'transactions', editingTransaction.id), transactionData);
      } else {
        await addDoc(collection(db, 'transactions'), transactionData);
      }

      // Update filter to the month of the saved transaction
      if (data.date) {
        const tDate = parseISO(data.date);
        setSelectedMonth(tDate.getMonth());
        setSelectedYear(tDate.getFullYear());
      }

      handleCloseModal();
    } catch (error) {
      handleFirestoreError(error, editingTransaction ? OperationType.UPDATE : OperationType.WRITE, 'transactions');
    }
  };

  const handleTogglePaid = async (t: Transaction) => {
    if (!user) return;
    try {
      const originalId = t.id.split('-inst-')[0];
      await updateDoc(doc(db, 'transactions', originalId), {
        isPaid: !t.isPaid,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'transactions');
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Erro no login:", error);
    }
  };

  const handleLogout = () => setIsLogoutModalOpen(true);
  const confirmLogout = () => {
    setIsLogoutModalOpen(false);
    signOut(auth);
  };

  const exportMonthlyToExcel = (data: Transaction[], filename: string) => {
    const mappedData = data.map(t => ({
      'Receita ou despesa': t.type === 'income' ? 'Receita' : 'Despesa',
      'Data': format(parseISO(t.date), 'dd/MM/yyyy'),
      'Nome da receita ou despesa': t.description || t.category,
      'Valor': t.amount
    }));
    const worksheet = XLSX.utils.json_to_sheet(mappedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Lançamentos");
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  const exportCCToExcel = (data: Transaction[], filename: string) => {
    const mappedData = data.map(t => ({
      'Data da compra': format(parseISO(t.date), 'dd/MM/yyyy'),
      'Banco': t.bank || '',
      'Estabelecimento': t.description,
      'Item': t.item || '',
      'Categoria': t.category,
      'Parcelas': t.isInstallment ? `${(t as any).currentInstallment}/${t.totalInstallments}` : '1/1',
      'Valor': t.amount
    }));
    const worksheet = XLSX.utils.json_to_sheet(mappedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Detalhamento Cartão");
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  const getAIAdvice = async () => {
    if (!user || isConsulting) return;
    
    setIsConsulting(true);
    setAiAdvice(null);
    setIsChatActive(true);
    setAiAdvice("Analisando sua vida financeira... Seja forte.");
    setChatMessages([
      { role: 'model', parts: [{ text: "Iniciando diagnóstico financeiro profundo. Aguarde enquanto analiso seus erros e acertos." }] }
    ]);

    try {
      const summary = {
        receitas: stats?.income || 0,
        despesas: stats?.expense || 0,
        saldo: stats?.balance || 0,
        cartao: ccStats?.expense || 0,
        categorias: (chartData || []).map(c => `${c.name}: ${c.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`).join(', ') || 'Nenhuma',
        cartaoCategorias: (ccChartData || []).map(c => `${c.name}: ${c.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`).join(', ') || 'Nenhuma',
        vr: vrStats?.expense || 0,
        vt: vtStats?.expense || 0
      };

      const promptHtml = `Você é um Consultor Financeiro Elite, ríspido, direto e extremamente firme. 
      Sua missão é dar um DIAGNÓSTICO real da vida financeira do usuário para o mês de ${months[selectedMonth]} de ${selectedYear}.
      
      Dados atuais:
      - Receitas: ${summary.receitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      - Despesas (Contas): ${summary.despesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      - Cartão de Crédito (PERIGO): ${summary.cartao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      - VR: ${summary.vr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} | VT: ${summary.vt.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      - Saldo que sobrou (ou faltou): ${summary.saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      - Categorias: ${summary.categorias}
      
      ESTRUTURA DA SUA RESPOSTA (Obrigatória):
      1. DIAGNÓSTICO CRÍTICO: Diga a verdade nua e crua sobre a situação. Se o cartão está alto, dê um esculacho.
      2. ONDE CORTAR IMEDIATAMENTE: Liste 3 categorias ou hábitos de onde o dinheiro está vazando.
      3. DICAS DE SEGUNDA RENDA: Sugira 2 formas reais (nada de pirâmide) de fazer dinheiro extra com base no perfil de gastos.
      4. DICAS DE INVESTIMENTO: Se sobrou dinheiro, diga onde investir (CDB, FIIs, etc). Se não sobrou, diga quanto falta para começar e onde ele vai tirar isso.
      5. META PARA O PRÓXIMO MÊS: Uma ordem direta para o usuário seguir.
      
      Seja autoritário e não enrole.`;

      const response = await fetch("/api/ai/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptHtml })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro no servidor");
      }

      const result = await response.json();
      const advice = result.text || "O consultor ficou mudo. Erro técnico inesperado.";
      setAiAdvice(advice);
      setChatMessages([
        { role: 'model', parts: [{ text: advice }] }
      ]);
    } catch (error: any) {
      console.error("Erro ao obter consultoria AI:", error);
      let errorMessage = `Erro no diagnóstico: ${error.message || 'A IA se perdeu nos seus dados'}. Tente de novo.`;
      
      if (error.message?.includes('GEMINI_API_KEY')) {
        errorMessage = "Chave de API (GEMINI_API_KEY) não encontrada no servidor. Configure-a nas configurações do ambiente.";
      } else if (error.message?.includes('quota')) {
        errorMessage = "Limite de uso da IA atingido. Tente novamente em alguns minutos.";
      }
      
      setAiAdvice(errorMessage);
      setChatMessages([{ role: 'model', parts: [{ text: errorMessage }] }]);
    } finally {
      setIsConsulting(false);
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isSendingChat || !user) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setIsSendingChat(true);

    const updatedHistory = [...chatMessages, { role: 'user' as const, parts: [{ text: userMessage }] }];
    setChatMessages(updatedHistory);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: chatMessages.map(m => ({
            role: m.role,
            parts: m.parts
          })),
          message: userMessage,
          systemInstruction: "Você é um consultor financeiro implacável. Respostas curtas, grossas e úteis. Se o usuário perguntar asneira, repreenda. Foco total em salvar o patrimônio dele. Se ele pedir dicas de investimento, seja específico. Se pedir renda extra, seja prático."
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro no servidor");
      }

      const result = await response.json();
      const responseText = result.text || "Sem foco. Tente perguntar com mais clareza.";
      setChatMessages([...updatedHistory, { role: 'model' as const, parts: [{ text: responseText }] }]);
    } catch (error: any) {
      console.error("Erro no chat AI:", error);
      let msg = `O consultor teve um curto-circuito: ${error.message || 'Erro de conexão'}.`;
      setChatMessages([...updatedHistory, { role: 'model' as const, parts: [{ text: msg }] }]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    const originalId = id.split('-inst-')[0];
    try {
      await deleteDoc(doc(db, 'transactions', originalId));
      setTransactionToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${originalId}`);
    }
  };

  const handleBatchFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsBatchScanning(true);
    setIsBatchModalOpen(true);
    setBatchTransactions([]);

    try {
      const filePromises = Array.from(files).map(file => {
        return new Promise<{mimeType: string, data: string}>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64Data = (reader.result as string).split(',')[1];
            if (!base64Data) {
              reject(new Error("Falha ao ler arquivo"));
              return;
            }
            resolve({ mimeType: file.type, data: base64Data });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const fileData = await Promise.all(filePromises);
      
      const imageParts = fileData.map(fd => ({
        inlineData: {
          mimeType: fd.mimeType,
          data: fd.data
        }
      }));

      const response = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: {
            parts: [
              ...imageParts,
              {
                text: `Analise esta fatura de cartão de crédito (que pode estar dividida em várias imagens/páginas) e extraia todas as transações individuais (linha a linha). 
                Para cada transação, identifique: 
                - data (YYYY-MM-DD)
                - valor (number, positivo para despesas)
                - estabelecimento (string)
                - item adquirido (string, se disponível na fatura)
                - categoria sugerida (Alimentação, Transporte, Lazer, Saúde, Educação, Moradia, Doação, Poupança do filho, Fatura do Cartão, Despesas com o carro, Celular, Outros)
                
                Retorne APENAS um array de objetos JSON seguindo este esquema: [{amount: number, category: string, description: string, item: string, date: string}].`
              }
            ]
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro no servidor");
      }

      const resultData = await response.json();
      const textResponse = resultData.text;
      const result = JSON.parse(textResponse || '[]');
      if (Array.isArray(result)) {
        setBatchTransactions(result.map(t => ({
          ...t,
          type: 'expense'
        })));
      }
      setIsBatchScanning(false);
    } catch (error) {
      console.error("Erro ao escanear fatura:", error);
      setIsBatchScanning(false);
    }
  };

  const handleSaveBatch = async () => {
    if (!user || batchTransactions.length === 0) return;

    try {
      // Filter out potential duplicates
      const newTransactions = batchTransactions.filter(bt => {
        const isDuplicate = transactions.some(t => 
          t.date === bt.date && 
          t.amount === bt.amount && 
          t.description === bt.description
        );
        return !isDuplicate;
      });

      if (newTransactions.length === 0) {
        alert("Todas as transações já foram importadas anteriormente.");
        setIsBatchModalOpen(false);
        return;
      }

      const promises = newTransactions.map(t => {
        const transactionData = {
          uid: user.uid,
          amount: t.amount || 0,
          type: 'expense',
          category: t.category || 'Outros',
          description: t.description || '', // Estabelecimento
          item: t.item || '',               // Item adquirido
          date: t.date || format(new Date(), 'yyyy-MM-dd'),
          createdAt: new Date().toISOString(),
          paymentMethod: 'credit_card'
        };
        return addDoc(collection(db, 'transactions'), transactionData);
      });

      await Promise.all(promises);

      // Update filter to the month of the imported transactions
      if (newTransactions.length > 0) {
        const firstDate = parseISO(newTransactions[0].date);
        setSelectedMonth(firstDate.getMonth());
        setSelectedYear(firstDate.getFullYear());
      }

      setIsBatchModalOpen(false);
      setBatchTransactions([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'transactions');
    }
  };

  const handleReclassify = async (id: string, newCategory: string) => {
    const originalId = id.split('-inst-')[0];
    try {
      await updateDoc(doc(db, 'transactions', originalId), { category: newCategory });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `transactions/${originalId}`);
    }
  };

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const transactionYears = transactions.map(t => {
      try {
        const d = parseISO(t.date);
        return d.getFullYear();
      } catch (e) {
        return currentYear;
      }
    });
    const yearSet = new Set([currentYear, ...transactionYears]);
    // Add a range of years around the current year
    for (let i = -10; i <= 5; i++) {
      yearSet.add(currentYear + i);
    }
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [transactions]);

  const handleBulkDelete = async () => {
    if (!selectedTransactions.length || !user) return;
    
    // Get unique original IDs (handling virtual installments)
    const uniqueIds = Array.from(new Set(selectedTransactions.map(id => id.split('-inst-')[0])));

    try {
      await Promise.all(uniqueIds.map(id => deleteDoc(doc(db, 'transactions', id))));
      setSelectedTransactions([]);
      setIsBulkDeleteConfirmOpen(false);
    } catch (error) {
      console.error("Erro ao excluir transações em massa:", error);
      handleFirestoreError(error, OperationType.DELETE, `bulk_delete/${selectedTransactions.length}`);
    }
  };

  const closeBulkEditModal = () => {
    setIsBulkEditModalOpen(false);
    setBulkEditField(null);
    setBulkEditValue('');
    setBulkEditError(null);
    setIsBulkEditing(false);
  };

  const handleBulkEdit = async () => {
    if (!selectedTransactions.length || !user || !bulkEditField || !bulkEditValue) return;

    setIsBulkEditing(true);
    setBulkEditError(null);

    try {
      await Promise.all(selectedTransactions.map(id => 
        updateDoc(doc(db, 'transactions', id), {
          [bulkEditField]: bulkEditValue,
          updatedAt: serverTimestamp()
        })
      ));
      setSelectedTransactions([]);
      closeBulkEditModal();
    } catch (error: any) {
      console.error("Erro ao editar transações em massa:", error);
      let errorMessage = "Erro ao salvar alterações. Verifique sua conexão.";
      
      if (error.message && error.message.includes('permission-denied')) {
        errorMessage = "Permissão negada. Verifique se você é o dono destas transações.";
      } else if (error.message) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed.error) errorMessage = `Erro: ${parsed.error}`;
        } catch (e) {
          // Not JSON, use generic or error.message
        }
      }
      
      setBulkEditError(errorMessage);
      setIsBulkEditing(false);
    }
  };

  const toggleSelectAll = (ids: string[]) => {
    if (selectedTransactions.length === ids.length) {
      setSelectedTransactions([]);
    } else {
      setSelectedTransactions(ids);
    }
  };

  const toggleSelectTransaction = (id: string) => {
    setSelectedTransactions(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  // Combined Data Processing for Performance
  const processedData = useMemo(() => {
    const stats = { income: 0, expense: 0, balance: 0 }; // Monthly Regular
    const allTimeStats = { income: 0, expense: 0, balance: 0 }; // All Time Regular
    const ccStats = { income: 0, expense: 0, balance: 0 }; // Monthly CC
    const allTimeCCStats = { income: 0, expense: 0, balance: 0 }; // All Time CC
    const vrStats = { income: 0, expense: 0, balance: 0 }; // Monthly VR
    const allTimeVRStats = { income: 0, expense: 0, balance: 0 }; // All Time VR
    const vtStats = { income: 0, expense: 0, balance: 0 }; // Monthly VT
    const allTimeVTStats = { income: 0, expense: 0, balance: 0 }; // All Time VT
    const categories: Record<string, number> = {};
    const ccCategories: Record<string, number> = {};
    const vrCategories: Record<string, number> = {};
    const vtCategories: Record<string, number> = {};
    const monthly: Record<string, { month: string, income: number, expense: number, fullKey: string }> = {};
    
    // Selection boundary
    const selectionDate = new Date(selectedYear, selectedMonth, 1);
    const selectionEndDate = endOfMonth(selectionDate);

    // Pre-populate last 6 months relative to selection
    for (let i = 5; i >= 0; i--) {
      const d = new Date(selectedYear, selectedMonth - i, 1);
      const key = format(d, 'MMM', { locale: ptBR });
      const fullKey = format(d, 'yyyy-MM');
      monthly[fullKey] = { month: key, income: 0, expense: 0, fullKey };
    }

    const filteredTransactions: Transaction[] = []; // Dashboard (Always monthly)
    const ccFilteredTransactions: Transaction[] = []; // CC Tab (Installments/Bills)
    const vrFilteredTransactions: Transaction[] = []; // VR Tab
    const vtFilteredTransactions: Transaction[] = []; // VT Tab
    const allHistoryTransactions: Transaction[] = []; // All time with installments

    transactions.forEach(t => {
      const tDate = parseISO(t.date);
      
      // Skip if date is invalid to prevent "Invalid time value" errors
      if (isNaN(tDate.getTime())) {
        console.warn(`Transaction ${t.id} has an invalid date: ${t.date}`);
        return;
      }
      
      // Treat as credit card if explicitly marked
      const isCreditCard = t.paymentMethod === 'credit_card';
      const isVR = t.paymentMethod === 'vr';
      const isVT = t.paymentMethod === 'vt';
      
      if (isCreditCard) {
        const totalInst = t.isInstallment ? (t.totalInstallments || 1) : 1;
        let startOffset = (!t.isInstallment && t.billingCycle === 'current') ? 0 : 1;
        
        // If specific billing month is provided, calculate offset
        if (t.billingMonth) {
          const [bYear, bMonth] = t.billingMonth.split('-').map(Number);
          const tMonth = tDate.getMonth();
          const tYear = tDate.getFullYear();
          startOffset = (bYear - tYear) * 12 + (bMonth - 1 - tMonth);
        }
        
        for (let i = startOffset; i < (totalInst + startOffset); i++) {
          const billingDate = addMonths(tDate, i);
          const bMonth = billingDate.getMonth();
          const bYear = billingDate.getFullYear();
          const bFullKey = format(billingDate, 'yyyy-MM');
          const installmentAmount = t.isInstallment ? (t.amount / totalInst) : t.amount;
          
          const isSelectedMonth = bMonth === selectedMonth && bYear === selectedYear;
          const isOnOrBeforeSelection = billingDate <= selectionEndDate;

          // All Time CC Stats
          if (isOnOrBeforeSelection) {
            if (t.type === 'income') allTimeCCStats.income += installmentAmount;
            else allTimeCCStats.expense += installmentAmount;
          }

          // Virtual transaction for history/cc
          const virtualT = {
            ...t,
            id: `${t.id}-inst-${i}`,
            amount: installmentAmount,
            currentInstallment: t.isInstallment ? (i - startOffset + 1) : 1,
            date: t.date // Keep original purchase date
          };

          // Add to all history (for the History tab)
          allHistoryTransactions.push(virtualT);

          // Add to CC Tab if it matches the selected month OR if showAllCC is true
          if (showAllCC || isSelectedMonth) {
            // Apply installments filter if active
            if (showOnlyInstallments && !t.isInstallment) continue;
            
            // Add to CC specific list
            ccFilteredTransactions.push(virtualT);
            
            // Add to CC stats and CC chart data if it's the selected month
            if (isSelectedMonth) {
              if (t.type === 'income') {
                ccStats.income += virtualT.amount;
              } else {
                ccStats.expense += virtualT.amount;
                ccCategories[t.category] = (ccCategories[t.category] || 0) + virtualT.amount;
              }
            }
          }

          if (monthly[bFullKey]) {
            // Keep monthly chart for regular transactions only as per user request
          }
        }
      } else if (isVR) {
        const tMonth = tDate.getMonth();
        const tYear = tDate.getFullYear();
        const isSelectedMonth = tMonth === selectedMonth && tYear === selectedYear;
        const isOnOrBeforeSelection = tDate <= selectionEndDate;

        allHistoryTransactions.push(t);

        if (isOnOrBeforeSelection) {
          if (t.type === 'income') allTimeVRStats.income += t.amount;
          else allTimeVRStats.expense += t.amount;
        }

        if (isSelectedMonth) {
          vrFilteredTransactions.push(t);
          if (t.type === 'income') vrStats.income += t.amount;
          else {
            vrStats.expense += t.amount;
            vrCategories[t.category] = (vrCategories[t.category] || 0) + t.amount;
          }
        }
      } else if (isVT) {
        const tMonth = tDate.getMonth();
        const tYear = tDate.getFullYear();
        const isSelectedMonth = tMonth === selectedMonth && tYear === selectedYear;
        const isOnOrBeforeSelection = tDate <= selectionEndDate;

        allHistoryTransactions.push(t);

        if (isOnOrBeforeSelection) {
          if (t.type === 'income') allTimeVTStats.income += t.amount;
          else allTimeVTStats.expense += t.amount;
        }

        if (isSelectedMonth) {
          vtFilteredTransactions.push(t);
          if (t.type === 'income') vtStats.income += t.amount;
          else {
            vtStats.expense += t.amount;
            vtCategories[t.category] = (vtCategories[t.category] || 0) + t.amount;
          }
        }
      } else {
        const tMonth = tDate.getMonth();
        const tYear = tDate.getFullYear();
        const tFullKey = format(tDate, 'yyyy-MM');
        const isSelectedMonth = tMonth === selectedMonth && tYear === selectedYear;
        const isOnOrBeforeSelection = tDate <= selectionEndDate;

        // All history
        allHistoryTransactions.push(t);

        // All Time Regular Stats
        if (isOnOrBeforeSelection) {
          if (t.type === 'income') allTimeStats.income += t.amount;
          else allTimeStats.expense += t.amount;
        }

        // Monthly Stats (Dashboard)
        if (isSelectedMonth) {
          filteredTransactions.push(t);
          if (t.type === 'income') stats.income += t.amount;
          else {
            stats.expense += t.amount;
            categories[t.category] = (categories[t.category] || 0) + t.amount;
          }
        }

        if (monthly[tFullKey]) {
          if (t.type === 'income') monthly[tFullKey].income += t.amount;
          else monthly[tFullKey].expense += t.amount;
        }
      }
    });

    // Final calculations
    stats.balance = stats.income - stats.expense;
    allTimeStats.balance = allTimeStats.income - allTimeStats.expense;
    ccStats.balance = ccStats.income - ccStats.expense;
    allTimeCCStats.balance = allTimeCCStats.income - allTimeCCStats.expense;
    vrStats.balance = vrStats.income - vrStats.expense;
    vtStats.balance = vtStats.income - vtStats.expense;

    return {
      stats,
      allTimeStats,
      ccStats,
      allTimeCCStats,
      vrStats,
      vtStats,
      chartData: Object.entries(categories).map(([name, value]) => ({ name, value })),
      ccChartData: Object.entries(ccCategories).map(([name, value]) => ({ name, value })),
      vrChartData: Object.entries(vrCategories).map(([name, value]) => ({ name, value })),
      vtChartData: Object.entries(vtCategories).map(([name, value]) => ({ name, value })),
      monthlyData: Object.values(monthly).sort((a, b) => a.fullKey.localeCompare(b.fullKey)),
      filteredTransactions,
      ccFilteredTransactions,
      vrFilteredTransactions,
      vtFilteredTransactions,
      allHistoryTransactions
    };
  }, [transactions, selectedMonth, selectedYear, showAllCC, showOnlyInstallments]);

  const { 
    stats, 
    allTimeStats, 
    ccStats, 
    allTimeCCStats,
    vrStats, 
    vtStats, 
    chartData, 
    ccChartData, 
    vrChartData, 
    vtChartData, 
    monthlyData, 
    filteredTransactions, 
    ccFilteredTransactions, 
    vrFilteredTransactions, 
    vtFilteredTransactions, 
    allHistoryTransactions 
  } = processedData;

  const historyTransactions = useMemo(() => {
    const baseTransactions = showAllHistory ? allHistoryTransactions : filteredTransactions;
    const term = searchTerm.toLowerCase();
    
    return baseTransactions.filter(t => {
      const matchesSearch = !term || 
        t.description.toLowerCase().includes(term) ||
        t.category.toLowerCase().includes(term) ||
        (t.item && t.item.toLowerCase().includes(term));
      
      return matchesSearch;
    });
  }, [filteredTransactions, allHistoryTransactions, showAllHistory, searchTerm]);

  const historyIncomeTransactions = useMemo(() => historyTransactions.filter(t => t.type === 'income'), [historyTransactions]);
  const historyExpenseTransactions = useMemo(() => historyTransactions.filter(t => t.type === 'expense'), [historyTransactions]);

  const ccTransactions = useMemo(() => {
    const term = ccSearchTerm.toLowerCase();
    const fDate = ccFilterDate.toLowerCase();
    const fBank = ccFilterBank.toLowerCase();
    const fEst = ccFilterEstablishment.toLowerCase();
    const fItem = ccFilterItem.toLowerCase();
    const fCat = ccFilterCategory.toLowerCase();

    return ccFilteredTransactions.filter(t => {
      const matchesSearch = !term ||
        t.description.toLowerCase().includes(term) ||
        t.category.toLowerCase().includes(term) ||
        (t.item && t.item.toLowerCase().includes(term));

      const matchesDate = !fDate || format(parseISO(t.date), 'dd/MM/yyyy').includes(fDate);
      const matchesBank = !fBank || (t.bank && t.bank.toLowerCase().includes(fBank));
      const matchesEst = !fEst || t.description.toLowerCase().includes(fEst);
      const matchesItem = !fItem || (t.item && t.item.toLowerCase().includes(fItem));
      const matchesCat = !fCat || t.category.toLowerCase().includes(fCat);

      return matchesSearch && matchesDate && matchesBank && matchesEst && matchesItem && matchesCat;
    });
  }, [ccFilteredTransactions, ccSearchTerm, ccFilterDate, ccFilterBank, ccFilterEstablishment, ccFilterItem, ccFilterCategory]);

  const ccFilteredTotal = useMemo(() => {
    return ccTransactions.reduce((acc, t) => acc + t.amount, 0);
  }, [ccTransactions]);

  const vrTransactions = useMemo(() => {
    const term = vrSearchTerm.toLowerCase();
    const fDate = vrFilterDate.toLowerCase();
    const fEst = vrFilterEstablishment.toLowerCase();
    const fItem = vrFilterItem.toLowerCase();
    const fCat = vrFilterCategory.toLowerCase();

    return vrFilteredTransactions.filter(t => {
      const matchesSearch = !term ||
        t.description.toLowerCase().includes(term) ||
        t.category.toLowerCase().includes(term) ||
        (t.item && t.item.toLowerCase().includes(term));

      const matchesDate = !fDate || format(parseISO(t.date), 'dd/MM/yyyy').includes(fDate);
      const matchesEst = !fEst || t.description.toLowerCase().includes(fEst);
      const matchesItem = !fItem || (t.item && t.item.toLowerCase().includes(fItem));
      const matchesCat = !fCat || t.category.toLowerCase().includes(fCat);

      return matchesSearch && matchesDate && matchesEst && matchesItem && matchesCat;
    });
  }, [vrFilteredTransactions, vrSearchTerm, vrFilterDate, vrFilterEstablishment, vrFilterItem, vrFilterCategory]);

  const vrFilteredTotal = useMemo(() => {
    return vrTransactions.reduce((acc, t) => acc + t.amount, 0);
  }, [vrTransactions]);

  const vtTransactions = useMemo(() => {
    const term = vtSearchTerm.toLowerCase();
    const fDate = vtFilterDate.toLowerCase();
    const fEst = vtFilterEstablishment.toLowerCase();
    const fItem = vtFilterItem.toLowerCase();
    const fCat = vtFilterCategory.toLowerCase();

    return vtFilteredTransactions.filter(t => {
      const matchesSearch = !term ||
        t.description.toLowerCase().includes(term) ||
        t.category.toLowerCase().includes(term) ||
        (t.item && t.item.toLowerCase().includes(term));

      const matchesDate = !fDate || format(parseISO(t.date), 'dd/MM/yyyy').includes(fDate);
      const matchesEst = !fEst || t.description.toLowerCase().includes(fEst);
      const matchesItem = !fItem || (t.item && t.item.toLowerCase().includes(fItem));
      const matchesCat = !fCat || t.category.toLowerCase().includes(fCat);

      return matchesSearch && matchesDate && matchesEst && matchesItem && matchesCat;
    });
  }, [vtFilteredTransactions, vtSearchTerm, vtFilterDate, vtFilterEstablishment, vtFilterItem, vtFilterCategory]);

  const vtFilteredTotal = useMemo(() => {
    return vtTransactions.reduce((acc, t) => acc + t.amount, 0);
  }, [vtTransactions]);

  const drillDownData = useMemo(() => {
    if (!selectedCategoryForDrillDown) return [];
    
    const sourceTransactions = 
      activeTab === 'credit_card' ? ccFilteredTransactions : 
      activeTab === 'vr' ? vrFilteredTransactions :
      activeTab === 'vt' ? vtFilteredTransactions :
      filteredTransactions;

    return sourceTransactions
      .filter(t => t.type === 'expense' && t.category === selectedCategoryForDrillDown)
      .map(t => ({
        name: t.description || 'Sem descrição',
        item: t.item || '',
        value: t.amount,
        date: format(parseISO(t.date), 'dd/MM/yy')
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions, ccFilteredTransactions, selectedCategoryForDrillDown, activeTab]);

  const tabContent = useMemo(() => {
    if (activeTab === 'dashboard') {
      return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
            {/* AI Consultant Section */}
            <div className="lg:col-span-2 bg-zinc-900 text-white p-5 sm:p-8 rounded-3xl sm:rounded-[2rem] shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] -mr-32 -mt-32"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 blur-[100px] -ml-32 -mb-32"></div>
              
              <div className="relative z-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 mb-6 sm:mb-8">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-14 sm:h-14 bg-emerald-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center border border-emerald-500/30 shrink-0">
                      <Sparkles className="w-5 h-5 sm:w-7 sm:h-7 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold tracking-tight">Consultor Financeiro Elite</h3>
                      <p className="text-zinc-400 text-[10px] sm:text-sm">Pare de queimar dinheiro e comece a construir patrimônio</p>
                    </div>
                  </div>
                  <button 
                    onClick={getAIAdvice}
                    disabled={isConsulting}
                    className="w-full md:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-900 font-black rounded-xl sm:rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20 uppercase tracking-wider text-xs sm:text-sm"
                  >
                    {isConsulting ? (
                      <>
                        <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                        <span>Diagnosticando...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>Fazer Diagnóstico Financeiro</span>
                      </>
                    )}
                  </button>
                </div>

                {isChatActive ? (
                  <div className="flex flex-col gap-4 sm:gap-6">
                    <div className="max-h-[400px] sm:max-h-[600px] overflow-y-auto pr-2 sm:pr-4 space-y-4 sm:space-y-6 custom-scrollbar">
                      {chatMessages.map((msg, idx) => (
                        <motion.div 
                          key={idx}
                          initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={cn(
                            "flex gap-3 sm:gap-4",
                            msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0",
                            msg.role === 'user' ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-400"
                          )}>
                            {msg.role === 'user' ? <UserIcon className="w-4 h-4 sm:w-5 sm:h-5" /> : <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />}
                          </div>
                          <div className={cn(
                            "p-4 sm:p-6 rounded-2xl sm:rounded-3xl max-w-[90%] sm:max-w-[85%] text-sm sm:text-lg leading-relaxed",
                            msg.role === 'user' ? "bg-blue-500/10 border border-blue-500/20 text-blue-50" : "bg-white/5 border border-white/10 text-zinc-200"
                          )}>
                            <div className="whitespace-pre-wrap">{msg.parts[0].text}</div>
                          </div>
                        </motion.div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                    
                    <form onSubmit={handleSendChatMessage} className="relative mt-2 sm:mt-4">
                      <input 
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Pergunte sobre investimentos ou como economizar..."
                        disabled={isSendingChat}
                        className="w-full bg-white/5 border border-white/10 p-4 sm:p-6 pr-14 sm:pr-16 rounded-2xl sm:rounded-3xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-sm sm:text-lg"
                      />
                      <button 
                        type="submit" 
                        disabled={!chatInput.trim() || isSendingChat}
                        className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-900 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-emerald-500/20"
                      >
                        {isSendingChat ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Send className="w-4 h-4 sm:w-5 sm:h-5" />}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-3xl">
                    <p className="text-zinc-500 font-medium max-w-md mx-auto">Sua vida financeira precisa de uma intervenção. Clique acima para um diagnóstico completo e pare de desperdiçar seu potencial.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Main Chart */}
            <div className="glass-card p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem]">
              <h3 className="text-base sm:text-lg font-bold mb-4 sm:mb-8 flex items-center gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                  <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                Fluxo Mensal
              </h3>
              <div className="h-56 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                    <YAxis hide />
                    <Tooltip 
                      cursor={{ fill: '#f4f4f5' }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    />
                    <Bar dataKey="income" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart */}
            <div className="glass-card p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem]">
              <h3 className="text-base sm:text-lg font-bold mb-4 sm:mb-8 flex items-center gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                  <PieChartIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                Gastos por Categoria
              </h3>
              <div className="h-56 sm:h-72 w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={90}
                        paddingAngle={8}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={COLORS[index % COLORS.length]} 
                            onClick={() => setSelectedCategoryForDrillDown(entry.name)}
                            style={{ cursor: 'pointer' }}
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-400 italic">
                    Nenhum dado de despesa ainda.
                  </div>
                )}
              </div>
            </div>

          {/* Recent Transactions */}
          <div className="lg:col-span-2 glass-card p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem]">
            <div className="flex justify-between items-center mb-6 sm:mb-8">
              <div className="flex flex-col">
                <h3 className="text-base sm:text-lg font-bold flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-600">
                    <History className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  Atividades Recentes
                </h3>
                <p className="text-[10px] sm:text-xs text-zinc-500 font-medium mt-1 ml-11 sm:ml-13">
                  {months[selectedMonth]} / {selectedYear}
                </p>
              </div>
              <button 
                onClick={() => {
                  setActiveTab('history');
                  setShowAllHistory(true);
                }}
                className="text-blue-600 text-xs sm:text-sm font-bold hover:underline"
              >
                Ver tudo
              </button>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {filteredTransactions.slice(0, 5).map((t) => (
                <div 
                  key={t.id} 
                  onClick={() => handleEditClick(t)}
                  className="flex items-center justify-between p-4 sm:p-6 hover:bg-white/50 rounded-2xl sm:rounded-3xl transition-all group cursor-pointer border border-transparent hover:border-zinc-200"
                >
                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className={cn(
                      "w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm shrink-0",
                      t.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                    )}>
                      {t.type === 'income' ? <ArrowUpRight className="w-5 h-5 sm:w-7 sm:h-7" /> : <ArrowDownRight className="w-5 h-5 sm:w-7 sm:h-7" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-zinc-900 text-sm sm:text-lg truncate">{t.category}</p>
                      <p className="text-xs sm:text-sm text-zinc-500 truncate">
                        {t.description}
                        {t.item && <span className="text-zinc-400 ml-1 sm:hidden">•</span>}
                        {t.item && <span className="text-zinc-400 ml-1 hidden sm:inline">• {t.item}</span>}
                        {!t.description && !t.item && 'Sem descrição'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className="text-right shrink-0">
                      <p className={cn(
                        "font-black text-sm sm:text-lg",
                        t.type === 'income' ? "text-emerald-600" : "text-red-600"
                      )}>
                        {t.type === 'income' ? '+' : '-'} {t.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{format(parseISO(t.date), 'dd MMM', { locale: ptBR })}</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleEditClick(t); }}
                        className="p-3 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setTransactionToDelete(t.id); }}
                        className="p-3 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredTransactions.length === 0 && (
                <div className="text-center py-12 flex flex-col items-center gap-4">
                  <div className="p-4 bg-zinc-50 rounded-full">
                    <History className="w-8 h-8 text-zinc-300" />
                  </div>
                  <div className="text-zinc-400 italic">
                    {transactions.length > 0 
                      ? "Nenhuma transação para este mês. Verifique outros meses no seletor acima ou veja o histórico completo." 
                      : "Nenhuma transação encontrada. Clique em '+' para adicionar."}
                  </div>
                  {transactions.length > 0 && (
                    <button 
                      onClick={() => {
                        setActiveTab('history');
                        setShowAllHistory(false);
                      }}
                      className="px-6 py-2 bg-emerald-50 text-emerald-600 font-bold rounded-xl hover:bg-emerald-100 transition-all text-sm"
                    >
                      Ver Contas do Mês Completo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    } else if (activeTab === 'history') {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-3xl font-black text-zinc-900 tracking-tight">Receitas e despesas mensal</h2>
              <p className="text-zinc-500 font-medium">
                {showAllHistory ? 'Exibindo todos os registros' : `Exibindo: ${months[selectedMonth]} / ${selectedYear}`}
              </p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Buscar por estabelecimento, item ou categoria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
              />
            </div>
            <div className="flex items-center gap-3 bg-emerald-50 p-3 rounded-2xl border border-emerald-100 shadow-sm shrink-0">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-emerald-900">Visão Completa</span>
                <span className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Ignorar filtro de mês/ano</span>
              </div>
              <button
                onClick={() => setShowAllHistory(!showAllHistory)}
                className={cn(
                  "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none shadow-inner",
                  showAllHistory ? "bg-emerald-600" : "bg-zinc-300"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm",
                    showAllHistory ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
            <button 
              onClick={() => exportMonthlyToExcel(historyTransactions, `Lancamentos_${months[selectedMonth]}_${selectedYear}`)}
              className="flex items-center gap-2 px-6 py-4 bg-white border border-zinc-200 rounded-2xl text-zinc-600 font-bold hover:bg-zinc-50 transition-all shadow-sm"
            >
              <FileText className="w-5 h-5 text-emerald-600" />
              <span>Exportar Excel</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Income Column */}
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden h-fit">
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-emerald-50/30">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleSelectAll(historyIncomeTransactions.map(t => t.id))}
                    className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                      historyIncomeTransactions.length > 0 && 
                      historyIncomeTransactions.every(t => selectedTransactions.includes(t.id))
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "border-zinc-300 hover:border-emerald-500 bg-white"
                    )}
                  >
                    {historyIncomeTransactions.length > 0 && 
                     historyIncomeTransactions.every(t => selectedTransactions.includes(t.id)) && 
                     <Check className="w-3 h-3" />}
                  </button>
                  <h3 className="font-bold text-emerald-700 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Receitas
                  </h3>
                </div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
                  {historyIncomeTransactions.length}
                </span>
              </div>
              <div className="divide-y divide-zinc-100">
                {historyIncomeTransactions.map((t) => (
                  <div 
                    key={t.id} 
                    className={cn(
                      "flex items-center gap-4 p-6 hover:bg-zinc-50 transition-colors group cursor-pointer",
                      selectedTransactions.includes(t.id) ? "bg-emerald-50/50" : ""
                    )}
                    onClick={() => toggleSelectTransaction(t.id)}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelectTransaction(t.id); }}
                      className={cn(
                        "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0",
                        selectedTransactions.includes(t.id)
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-zinc-200 group-hover:border-emerald-400 bg-white"
                      )}
                    >
                      {selectedTransactions.includes(t.id) && <Check className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                          <ArrowUpRight className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900">{t.category}</p>
                          <p className="text-sm text-zinc-500">
                            {t.description}
                            {t.item && <span className="text-zinc-400 ml-1">• {t.item}</span>}
                            {!t.description && !t.item && 'Sem descrição'}
                          </p>
                          <p className="text-xs text-zinc-400 mt-1">
                            {format(parseISO(t.date), "dd 'de' MMM", { locale: ptBR })}
                            {showAllHistory && <span className="ml-1 text-zinc-300">({format(parseISO(t.date), 'yyyy')})</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-bold text-emerald-600">
                            + {t.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleTogglePaid(t); }}
                            className={cn(
                              "p-2 rounded-lg transition-all",
                              t.isPaid 
                                ? "text-emerald-600 bg-emerald-50" 
                                : "text-zinc-300 hover:text-emerald-500 hover:bg-zinc-100"
                            )}
                            title={t.isPaid ? "Recebido" : "Marcar como recebido"}
                          >
                            <Check className={cn("w-5 h-5", t.isPaid ? "stroke-[3px]" : "")} />
                          </button>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleEditClick(t); }}
                              className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setTransactionToDelete(t.id); }}
                              className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {historyIncomeTransactions.length === 0 && (
                  <div className="p-12 text-center text-zinc-400 italic">
                    {transactions.filter(t => t.type === 'income').length > 0 
                      ? (showAllHistory ? "Nenhuma receita encontrada com este filtro." : "Nenhuma receita para este mês.") 
                      : "Nenhuma receita registrada."}
                  </div>
                )}
              </div>
            </div>

              {/* Expense Column */}
              <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden h-fit">
                <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-red-50/30">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleSelectAll(historyExpenseTransactions.map(t => t.id))}
                      className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                        historyExpenseTransactions.length > 0 && 
                        historyExpenseTransactions.every(t => selectedTransactions.includes(t.id))
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "border-zinc-300 hover:border-emerald-500 bg-white"
                      )}
                    >
                      {historyExpenseTransactions.length > 0 && 
                       historyExpenseTransactions.every(t => selectedTransactions.includes(t.id)) && 
                       <Check className="w-3 h-3" />}
                    </button>
                    <h3 className="font-bold text-red-700 flex items-center gap-2">
                      <TrendingDown className="w-5 h-5" />
                      Despesas
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full">
                    {historyExpenseTransactions.length}
                  </span>
                </div>
                <div className="divide-y divide-zinc-100">
                  {historyExpenseTransactions.map((t) => (
                    <div 
                      key={t.id} 
                      className={cn(
                        "flex items-center gap-4 p-6 hover:bg-zinc-50 transition-colors group cursor-pointer",
                        selectedTransactions.includes(t.id) ? "bg-emerald-50/50" : ""
                      )}
                      onClick={() => toggleSelectTransaction(t.id)}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelectTransaction(t.id); }}
                        className={cn(
                          "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0",
                          selectedTransactions.includes(t.id)
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-zinc-200 group-hover:border-emerald-400"
                        )}
                      >
                        {selectedTransactions.includes(t.id) && <Check className="w-4 h-4" />}
                      </button>
                      <div className="flex-1 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                            <ArrowDownRight className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="font-bold text-zinc-900">
                              {t.category}
                              {t.isInstallment && (
                                <span className="ml-2 text-[10px] font-bold bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  {t.paidInstallments}/{t.totalInstallments} Parc.
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-zinc-500">
                              {t.description}
                              {t.item && <span className="text-zinc-400 ml-1">• {t.item}</span>}
                              {!t.description && !t.item && 'Sem descrição'}
                            </p>
                            <p className="text-xs text-zinc-400 mt-1">
                              {format(parseISO(t.date), "dd 'de' MMM", { locale: ptBR })}
                              {showAllHistory && <span className="ml-1 text-zinc-300">({format(parseISO(t.date), 'yyyy')})</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold text-red-600">
                              - {t.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleTogglePaid(t); }}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                t.isPaid 
                                  ? "text-emerald-600 bg-emerald-50" 
                                  : "text-zinc-300 hover:text-emerald-500 hover:bg-zinc-100"
                              )}
                              title={t.isPaid ? "Pago" : "Marcar como pago"}
                            >
                              <Check className={cn("w-5 h-5", t.isPaid ? "stroke-[3px]" : "")} />
                            </button>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleEditClick(t); }}
                                className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                              >
                                <Edit2 className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setTransactionToDelete(t.id); }}
                                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                {historyExpenseTransactions.length === 0 && (
                  <div className="p-12 text-center text-zinc-400 italic">
                    {transactions.filter(t => t.type === 'expense').length > 0 
                      ? (showAllHistory ? "Nenhuma despesa encontrada com este filtro." : "Nenhuma despesa para este mês.") 
                      : "Nenhuma despesa registrada."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    } else if (activeTab === 'credit_card') {
      return (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Buscar na fatura..."
                value={ccSearchTerm}
                onChange={(e) => setCcSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
              />
            </div>
            <div className="flex items-center gap-3 bg-emerald-50 p-3 rounded-2xl border border-emerald-100 shadow-sm shrink-0">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-emerald-900">Exibir Tudo</span>
                <span className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Todas as faturas</span>
              </div>
              <button
                onClick={() => setShowAllCC(!showAllCC)}
                className={cn(
                  "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none shadow-inner",
                  showAllCC ? "bg-emerald-600" : "bg-zinc-300"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm",
                    showAllCC ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
            <div className="flex items-center gap-3 bg-zinc-50 p-3 rounded-2xl border border-zinc-200 shadow-sm shrink-0">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-zinc-900">Apenas Parcelados</span>
                <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Filtrar por parcelas</span>
              </div>
              <button
                onClick={() => setShowOnlyInstallments(!showOnlyInstallments)}
                className={cn(
                  "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none shadow-inner",
                  showOnlyInstallments ? "bg-emerald-600" : "bg-zinc-300"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm",
                    showOnlyInstallments ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
            <button 
              onClick={() => exportCCToExcel(ccTransactions, `Fatura_Cartao_${months[selectedMonth]}_${selectedYear}`)}
              className="flex items-center gap-2 px-6 py-4 bg-white border border-zinc-200 rounded-2xl text-zinc-600 font-bold hover:bg-zinc-50 transition-all shadow-sm"
            >
              <FileText className="w-5 h-5 text-emerald-600" />
              <span>Exportar Excel</span>
            </button>
          </div>

          {/* CC Chart */}
          <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-emerald-600" />
              Gastos no Cartão por Categoria
            </h3>
            <div className="h-64 w-full">
              {ccChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ccChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                      tickFormatter={(value) => `R$ ${value}`}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    />
                    <Bar 
                      dataKey="value" 
                      radius={[6, 6, 0, 0]}
                      onClick={(data) => setSelectedCategoryForDrillDown(data.name)}
                      style={{ cursor: 'pointer' }}
                    >
                      {ccChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-400 italic">
                  Nenhuma transação de cartão encontrada.
                </div>
              )}
            </div>
          </div>

          {/* CC Table */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="font-bold text-zinc-900">Detalhamento da Fatura</h3>
                {(ccFilterDate || ccFilterBank || ccFilterEstablishment || ccFilterItem || ccFilterCategory || ccSearchTerm) && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100">
                    <Filter className="w-3 h-3" />
                    <span>Total Filtrado: {ccFilteredTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                )}
              </div>
              {(ccFilterDate || ccFilterBank || ccFilterEstablishment || ccFilterItem || ccFilterCategory) && (
                <button 
                  onClick={() => {
                    setCcFilterDate('');
                    setCcFilterBank('');
                    setCcFilterEstablishment('');
                    setCcFilterItem('');
                    setCcFilterCategory('');
                  }}
                  className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Limpar Filtros
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => toggleSelectAll(ccTransactions.map(t => t.id))}
                          className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                            selectedTransactions.length === ccTransactions.length && ccTransactions.length > 0
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "border-zinc-300 hover:border-emerald-500"
                          )}
                        >
                          {selectedTransactions.length === ccTransactions.length && ccTransactions.length > 0 && <Check className="w-3 h-3" />}
                        </button>
                      </div>
                    </th>
                    <th className="px-6 py-4 font-bold">Data Compra</th>
                    <th className="px-6 py-4 font-bold">Banco</th>
                    <th className="px-6 py-4 font-bold">Estabelecimento</th>
                    <th className="px-6 py-4 font-bold">Item</th>
                    <th className="px-6 py-4 font-bold">Categoria</th>
                    <th className="px-6 py-4 font-bold">Parcelas</th>
                    <th className="px-6 py-4 font-bold text-right">Valor</th>
                    <th className="px-6 py-4 font-bold text-center">Ações</th>
                  </tr>
                  <tr className="bg-white border-b border-zinc-100">
                    <th className="px-6 py-2"></th>
                    <th className="px-6 py-2">
                      <input 
                        type="text" 
                        placeholder="Filtrar data..."
                        value={ccFilterDate}
                        onChange={(e) => setCcFilterDate(e.target.value)}
                        className="w-full text-[10px] p-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-normal"
                      />
                    </th>
                    <th className="px-6 py-2">
                      <input 
                        type="text" 
                        placeholder="Filtrar banco..."
                        value={ccFilterBank}
                        onChange={(e) => setCcFilterBank(e.target.value)}
                        className="w-full text-[10px] p-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-normal"
                      />
                    </th>
                    <th className="px-6 py-2">
                      <input 
                        type="text" 
                        placeholder="Filtrar estab..."
                        value={ccFilterEstablishment}
                        onChange={(e) => setCcFilterEstablishment(e.target.value)}
                        className="w-full text-[10px] p-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-normal"
                      />
                    </th>
                    <th className="px-6 py-2">
                      <input 
                        type="text" 
                        placeholder="Filtrar item..."
                        value={ccFilterItem}
                        onChange={(e) => setCcFilterItem(e.target.value)}
                        className="w-full text-[10px] p-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-normal"
                      />
                    </th>
                    <th className="px-6 py-2">
                      <input 
                        type="text" 
                        placeholder="Filtrar cat..."
                        value={ccFilterCategory}
                        onChange={(e) => setCcFilterCategory(e.target.value)}
                        className="w-full text-[10px] p-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-normal"
                      />
                    </th>
                    <th className="px-6 py-2"></th>
                    <th className="px-6 py-2"></th>
                    <th className="px-6 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {ccTransactions.map((t) => (
                    <tr 
                      key={t.id} 
                      className={cn(
                        "hover:bg-zinc-50 transition-colors group cursor-pointer",
                        selectedTransactions.includes(t.id) ? "bg-emerald-50/50" : ""
                      )}
                      onClick={() => toggleSelectTransaction(t.id)}
                    >
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSelectTransaction(t.id); }}
                          className={cn(
                            "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0",
                            selectedTransactions.includes(t.id)
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "border-zinc-200 group-hover:border-emerald-400"
                          )}
                        >
                          {selectedTransactions.includes(t.id) && <Check className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500">
                        {format(parseISO(t.date), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-zinc-600">
                        {t.bank || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-zinc-900">
                        {t.description}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500">
                        {t.item || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <select 
                          value={t.category}
                          onChange={(e) => handleReclassify(t.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-zinc-100 border-none rounded-lg text-xs font-bold px-2 py-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                        >
                          {CATEGORIES.expense.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500">
                        {t.isInstallment ? `${(t as any).currentInstallment}/${t.totalInstallments}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-red-600 text-right">
                        {t.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleEditClick(t); }}
                            className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setTransactionToDelete(t.id); }}
                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {ccTransactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-zinc-400 italic">
                        Importe uma fatura para ver os detalhes aqui.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    } else if (activeTab === 'vr' || activeTab === 'vt') {
      const isVR = activeTab === 'vr';
      const currentTransactions = isVR ? vrTransactions : vtTransactions;
      const currentChartData = isVR ? vrChartData : vtChartData;
      const currentStats = isVR ? vrStats : vtStats;
      const currentSearchTerm = isVR ? vrSearchTerm : vtSearchTerm;
      const setCurrentSearchTerm = isVR ? setVrSearchTerm : setVtSearchTerm;
      const currentFilterDate = isVR ? vrFilterDate : vtFilterDate;
      const setCurrentFilterDate = isVR ? setVrFilterDate : setVtFilterDate;
      const currentFilterEst = isVR ? vrFilterEstablishment : vtFilterEstablishment;
      const setCurrentFilterEst = isVR ? setVrFilterEstablishment : setVtFilterEstablishment;
      const currentFilterItem = isVR ? vrFilterItem : vtFilterItem;
      const setCurrentFilterItem = isVR ? setVrFilterItem : setVtFilterItem;
      const currentFilterCat = isVR ? vrFilterCategory : vtFilterCategory;
      const setCurrentFilterCat = isVR ? setVrFilterCategory : setVtFilterCategory;
      const currentFilteredTotal = isVR ? vrFilteredTotal : vtFilteredTotal;
      const title = isVR ? 'Vale Refeição' : 'Vale Transporte';
      const icon = isVR ? <Coffee className="w-5 h-5 text-emerald-600" /> : <Bus className="w-5 h-5 text-emerald-600" />;

      return (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
              <input 
                type="text" 
                placeholder={`Buscar em ${title}...`}
                value={currentSearchTerm}
                onChange={(e) => setCurrentSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
              />
            </div>
            <button 
              onClick={() => exportMonthlyToExcel(currentTransactions, `${title}_${months[selectedMonth]}_${selectedYear}`)}
              className="flex items-center gap-2 px-6 py-4 bg-white border border-zinc-200 rounded-2xl text-zinc-600 font-bold hover:bg-zinc-50 transition-all shadow-sm"
            >
              <FileText className="w-5 h-5 text-emerald-600" />
              <span>Exportar Excel</span>
            </button>
          </div>

          {/* Chart */}
          <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-emerald-600" />
              Gastos por Categoria ({title})
            </h3>
            <div className="h-64 w-full">
              {currentChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={currentChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                      tickFormatter={(value) => `R$ ${value}`}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    />
                    <Bar 
                      dataKey="value" 
                      radius={[6, 6, 0, 0]}
                      onClick={(data) => setSelectedCategoryForDrillDown(data.name)}
                      style={{ cursor: 'pointer' }}
                    >
                      {currentChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-400 italic">
                  Nenhuma transação encontrada para este mês.
                </div>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="font-bold text-zinc-900">Detalhamento de {title}</h3>
                {(currentFilterDate || currentFilterEst || currentFilterItem || currentFilterCat || currentSearchTerm) && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100">
                    <Filter className="w-3 h-3" />
                    <span>Total Filtrado: {currentFilteredTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                )}
              </div>
              {(currentFilterDate || currentFilterEst || currentFilterItem || currentFilterCat) && (
                <button 
                  onClick={() => {
                    setCurrentFilterDate('');
                    setCurrentFilterEst('');
                    setCurrentFilterItem('');
                    setCurrentFilterCat('');
                  }}
                  className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Limpar Filtros
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => toggleSelectAll(currentTransactions.map(t => t.id))}
                          className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                            selectedTransactions.length === currentTransactions.length && currentTransactions.length > 0
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "border-zinc-300 hover:border-emerald-500"
                          )}
                        >
                          {selectedTransactions.length === currentTransactions.length && currentTransactions.length > 0 && <Check className="w-3 h-3" />}
                        </button>
                      </div>
                    </th>
                    <th className="px-6 py-4 font-bold">Data</th>
                    <th className="px-6 py-4 font-bold">Estabelecimento</th>
                    <th className="px-6 py-4 font-bold">Item</th>
                    <th className="px-6 py-4 font-bold">Categoria</th>
                    <th className="px-6 py-4 font-bold text-right">Valor</th>
                    <th className="px-6 py-4 font-bold text-center">Ações</th>
                  </tr>
                  <tr className="bg-white border-b border-zinc-100">
                    <th className="px-6 py-2"></th>
                    <th className="px-6 py-2">
                      <input 
                        type="text" 
                        placeholder="Filtrar data..."
                        value={currentFilterDate}
                        onChange={(e) => setCurrentFilterDate(e.target.value)}
                        className="w-full text-[10px] p-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-normal"
                      />
                    </th>
                    <th className="px-6 py-2">
                      <input 
                        type="text" 
                        placeholder="Filtrar estab..."
                        value={currentFilterEst}
                        onChange={(e) => setCurrentFilterEst(e.target.value)}
                        className="w-full text-[10px] p-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-normal"
                      />
                    </th>
                    <th className="px-6 py-2">
                      <input 
                        type="text" 
                        placeholder="Filtrar item..."
                        value={currentFilterItem}
                        onChange={(e) => setCurrentFilterItem(e.target.value)}
                        className="w-full text-[10px] p-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-normal"
                      />
                    </th>
                    <th className="px-6 py-2">
                      <input 
                        type="text" 
                        placeholder="Filtrar cat..."
                        value={currentFilterCat}
                        onChange={(e) => setCurrentFilterCat(e.target.value)}
                        className="w-full text-[10px] p-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-normal"
                      />
                    </th>
                    <th className="px-6 py-2"></th>
                    <th className="px-6 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {currentTransactions.map((t) => (
                    <tr 
                      key={t.id} 
                      className={cn(
                        "hover:bg-zinc-50 transition-colors group cursor-pointer",
                        selectedTransactions.includes(t.id) ? "bg-emerald-50/50" : ""
                      )}
                      onClick={() => toggleSelectTransaction(t.id)}
                    >
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSelectTransaction(t.id); }}
                          className={cn(
                            "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0",
                            selectedTransactions.includes(t.id)
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "border-zinc-200 group-hover:border-emerald-400"
                          )}
                        >
                          {selectedTransactions.includes(t.id) && <Check className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500">
                        {format(parseISO(t.date), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-zinc-900">
                        {t.description}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500">
                        {t.item || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <select 
                          value={t.category}
                          onChange={(e) => handleReclassify(t.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-zinc-100 border-none rounded-lg text-xs font-bold px-2 py-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                        >
                          {CATEGORIES[t.type].map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </td>
                      <td className={cn(
                        "px-6 py-4 text-sm font-bold text-right",
                        t.type === 'income' ? "text-emerald-600" : "text-red-600"
                      )}>
                        {t.type === 'income' ? '+' : '-'} {t.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleEditClick(t); }}
                            className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setTransactionToDelete(t.id); }}
                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {currentTransactions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-zinc-400 italic">
                        Nenhuma transação encontrada para este mês.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }, [
    activeTab, transactions, monthlyData, chartData, COLORS, ptBR, handleEditClick, 
    setTransactionToDelete, setSelectedCategoryForDrillDown, setActiveTab, handleReclassify, 
    filteredTransactions, showAllHistory, showAllCC, searchTerm, ccSearchTerm,
    vrTransactions, vtTransactions, vrChartData, vtChartData, vrStats, vtStats,
    vrSearchTerm, vtSearchTerm, vrFilterDate, vtFilterDate, vrFilterEstablishment, vtFilterEstablishment,
    vrFilterItem, vtFilterItem, vrFilterCategory, vtFilterCategory, vrFilteredTotal, vtFilteredTotal,
    ccTransactions, ccChartData, ccStats, ccFilterDate, ccFilterBank, ccFilterEstablishment, ccFilterItem, ccFilterCategory, ccFilteredTotal,
    showOnlyInstallments, isConsulting, isChatActive, chatMessages, chatInput, isSendingChat, getAIAdvice, handleSendChatMessage
  ]);



  if (loading) {
    return (
      <div className="min-h-dvh bg-zinc-50 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500/10 blur-[100px] rounded-full" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-emerald-500/10 blur-[100px] rounded-full" />
          <Wallet className="absolute top-1/4 left-1/4 w-64 h-64 text-blue-600/5 -rotate-12" />
          <TrendingUp className="absolute bottom-1/4 right-1/4 w-64 h-64 text-emerald-600/5 rotate-12" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full glass-card rounded-[2.5rem] p-10 text-center relative z-10"
        >
          <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-blue-500/20">
            <Wallet className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-black text-zinc-900 mb-3 tracking-tight">Finanças<span className="text-blue-600">Pro</span></h1>
          <p className="text-zinc-500 mb- aggregation-relaxed">Assuma o controle total da sua vida financeira com inteligência e simplicidade.</p>
          
          <div className="mb-10 p-8 rounded-[2.5rem] bg-zinc-950 shadow-2xl shadow-zinc-900/50 relative overflow-hidden group border border-white/5">
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center gap-6 relative z-10">
              <EcsLogo variant="dark" size={80} />
              <div className="flex flex-col text-left leading-none">
                <span className="text-xs font-black text-zinc-400 uppercase tracking-[0.6em] mb-2">A product from</span>
                <span className="text-3xl font-black text-white tracking-widest">ECS SYSTEMS</span>
              </div>
            </div>
          </div>
          
          {authError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold animate-shake">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {authError}
            </div>
          )}

          <button
            onClick={handleLogin}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-black py-5 px-8 rounded-2xl transition-all flex items-center justify-center gap-4 shadow-2xl shadow-zinc-900/20 uppercase tracking-wider text-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6 bg-white rounded-full p-1" alt="Google" />
            Entrar com Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex min-h-dvh bg-zinc-50 text-zinc-900 overflow-x-hidden">
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          isInstallable={isInstallable}
          handleInstallClick={handleInstallClick}
          handleLogout={handleLogout}
        />
        
        <div className="flex-1 flex flex-col min-w-0 w-full overflow-x-hidden">
          {/* Header */}
          <header className="bg-white/70 backdrop-blur-xl border-b border-zinc-200 sticky top-0 z-40 safe-top w-full">
            <div className="max-w-6xl mx-auto px-4 h-16 sm:h-20 flex items-center justify-between gap-2 overflow-x-hidden">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
                  <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <h1 className="font-black text-lg sm:text-xl text-zinc-900 tracking-tight leading-none">Finanças<span className="text-blue-600">Pro</span></h1>
                  <div className="flex items-center gap-2 mt-1 hidden sm:flex">
                    <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Gestão Inteligente</p>
                    <div className="w-1 h-3 bg-zinc-200 rounded-full" />
                    <div className="flex items-center gap-2">
                      <EcsLogo size={20} className="border-[1.5px] rounded-lg shrink-0" />
                      <span className="text-xs font-black text-[#06182c] tracking-tighter">ECS <span className="text-[#06182c]/85">SYSTEMS</span></span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 sm:gap-3 bg-zinc-100/50 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-zinc-200/50">
                <CalendarIcon className="w-3 h-3 sm:w-4 sm:h-4 text-zinc-400 ml-1 sm:ml-2" />
                <select 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="bg-transparent border-none text-base sm:text-xs font-black text-zinc-700 focus:ring-0 outline-none cursor-pointer py-0.5 sm:py-1"
                >
                  {months.map((m, i) => (
                    <option key={m} value={i}>{m.substring(0, 3)}</option>
                  ))}
                </select>
                <div className="w-px h-3 sm:h-4 bg-zinc-300 mx-0.5 sm:mx-1" />
                <select 
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="bg-transparent border-none text-base sm:text-xs font-black text-zinc-700 focus:ring-0 outline-none cursor-pointer py-0.5 sm:py-1 pr-1 sm:pr-2"
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-4">
                {isInstallable && (
                  <button
                    onClick={handleInstallClick}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full font-bold text-xs cursor-pointer transition-all border border-blue-100 shadow-sm shadow-blue-500/5 active:scale-95"
                  >
                    <Download className="w-4 h-4 text-blue-600 animate-bounce" />
                    <span>Instalar App</span>
                  </button>
                )}
                
                <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-white/50 rounded-xl border border-zinc-200 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  {transactions.length} Lançamentos
                </div>
                
                <div className="hidden sm:flex items-center gap-2">
                  <input 
                    type="file" 
                    accept="application/pdf,image/*" 
                    onChange={handleBatchFileUpload}
                    className="hidden" 
                    id="batch-upload-header"
                    multiple
                  />
                  <label 
                    htmlFor="batch-upload-header"
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full font-bold text-xs cursor-pointer hover:bg-emerald-100 transition-colors border border-emerald-100"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="hidden xl:inline">Importar Fatura</span>
                  </label>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <img src={user.photoURL || ''} className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-2xl border-2 border-white shadow-sm" alt={user.displayName || ''} />
                  <button onClick={handleLogout} className="p-2 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500 transition-all md:hidden">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </header>

          <main className="max-w-6xl mx-auto px-4 py-6 sm:py-12 relative z-10 w-full pb-32 sm:pb-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 sm:gap-8 mb-8 sm:mb-16">
              <div className="space-y-1 sm:space-y-3">
                <h2 className="text-2xl sm:text-5xl font-black text-zinc-900 tracking-tight">
                  Olá, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-emerald-500">{user.displayName?.split(' ')[0] || 'Usuário'}</span>
                </h2>
                <p className="text-zinc-500 font-medium text-sm sm:text-lg">Resumo da sua saúde financeira hoje.</p>
              </div>
              
              <button 
                onClick={handleAddClick}
                className="flex items-center justify-center gap-3 sm:gap-4 px-6 sm:px-10 py-3.5 sm:py-5 bg-zinc-900 text-white font-black rounded-xl sm:rounded-[1.5rem] hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-900/20 uppercase tracking-widest text-[10px] sm:text-xs"
              >
                <Plus className="w-4 h-4 sm:w-6 sm:h-6" />
                Novo Lançamento
              </button>
            </div>

          {/* Summary Cards */}
          <div className={cn(
            "grid gap-4 sm:gap-6 mb-8 sm:mb-16",
            activeTab === 'credit_card' ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3"
          )}>
            <motion.div 
              key="summary-card-balance"
              whileHover={{ y: -8 }}
              className={cn(
                "glass-card p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem] relative overflow-hidden group border-none bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-blue-600/20 col-span-2 lg:col-span-1",
                activeTab === 'credit_card' ? "max-w-md col-span-1" : ""
              )}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl -mr-16 -mt-16" />
              <div className="flex justify-between items-start mb-4 sm:mb-6">
                <span className="text-[10px] sm:text-xs font-black text-blue-100 uppercase tracking-[0.2em]">
                  {activeTab === 'vr' ? 'Saldo VR' : 
                   activeTab === 'vt' ? 'Saldo VT' :
                   activeTab === 'credit_card' ? 'Despesas com cartão' :
                   (activeTab === 'history' && showAllHistory) ? 'Saldo Total' : 'Saldo Mensal'}
                </span>
                <div className="p-2 sm:p-3 bg-white/20 rounded-xl sm:rounded-2xl">
                  {activeTab === 'vr' ? <Coffee className="w-5 h-5 sm:w-6 sm:h-6" /> :
                   activeTab === 'vt' ? <Bus className="w-5 h-5 sm:w-6 sm:h-6" /> :
                   activeTab === 'credit_card' ? <PieChartIcon className="w-5 h-5 sm:w-6 sm:h-6" /> :
                   <Wallet className="w-5 h-5 sm:w-6 sm:h-6" />}
                </div>
              </div>
              <h2 className="text-xl sm:text-3xl font-black tracking-tight" id="balance-amount-display">
                <span>
                  {(
                    activeTab === 'vr' ? vrStats.balance :
                    activeTab === 'vt' ? vtStats.balance :
                    activeTab === 'credit_card' ? ccStats.expense :
                    (activeTab === 'history' && showAllHistory) ? allTimeStats.balance : stats.balance
                  ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </h2>
            </motion.div>

          {activeTab !== 'credit_card' && (
            <motion.div 
              key="summary-card-income"
              whileHover={{ y: -8 }}
              className="glass-card p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem] relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-colors" />
              <div className="flex justify-between items-start mb-4 sm:mb-6">
                <span className="text-[10px] sm:text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">
                  {activeTab === 'vr' ? 'Recargas' :
                   activeTab === 'vt' ? 'Recargas' :
                   (activeTab === 'history' && showAllHistory) ? 'Receitas Totais' : 'Receitas'}
                </span>
                <div className="p-2 sm:p-3 bg-emerald-50 rounded-xl sm:rounded-2xl text-emerald-600">
                  <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
              </div>
              <h2 className="text-xl sm:text-3xl font-black text-emerald-600 tracking-tight" id="income-amount-display">
                <span>
                  {(
                    activeTab === 'vr' ? vrStats.income :
                    activeTab === 'vt' ? vrStats.income :
                    (activeTab === 'history' && showAllHistory) ? allTimeStats.income : stats.income
                  ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </h2>
            </motion.div>
          )}

          {activeTab !== 'credit_card' && (
            <motion.div 
              key="summary-card-expense"
              whileHover={{ y: -8 }}
              className="glass-card p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem] relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-red-500/10 transition-colors" />
              <div className="flex justify-between items-start mb-4 sm:mb-6">
                <span className="text-[10px] sm:text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">
                  {activeTab === 'vr' ? 'Gastos' :
                   activeTab === 'vt' ? 'Gastos' :
                   (activeTab === 'history' && showAllHistory) ? 'Despesas Totais' : 'Despesas'}
                </span>
                <div className="p-2 sm:p-3 bg-red-50 rounded-xl sm:rounded-2xl text-red-600">
                  <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
              </div>
              <h2 className="text-xl sm:text-3xl font-black text-red-600 tracking-tight" id="expense-amount-display">
                <span>
                  {(
                    activeTab === 'vr' ? vrStats.expense :
                    activeTab === 'vt' ? vrStats.expense :
                    (activeTab === 'history' && showAllHistory) ? allTimeStats.expense : stats.expense
                  ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </h2>
            </motion.div>
          )}
        </div>


        {tabContent}
      </main>

      {/* Mobile Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-4 pt-2 pb-[env(safe-area-inset-bottom,12px)] flex items-center justify-around z-50">
        <button onClick={() => setActiveTab('history')} className={cn("p-2.5 rounded-2xl transition-all", activeTab === 'history' ? "bg-zinc-900 text-white shadow-lg" : "text-zinc-400")}>
          <History className="w-5 h-5" />
        </button>
        <button onClick={() => setActiveTab('dashboard')} className={cn("p-2.5 rounded-2xl transition-all", activeTab === 'dashboard' ? "bg-zinc-900 text-white shadow-lg" : "text-zinc-400")}>
          <LayoutDashboard className="w-5 h-5" />
        </button>
        <button onClick={() => setActiveTab('credit_card')} className={cn("p-2.5 rounded-2xl transition-all", activeTab === 'credit_card' ? "bg-zinc-900 text-white shadow-lg" : "text-zinc-400")}>
          <PieChartIcon className="w-5 h-5" />
        </button>
        <button onClick={() => setActiveTab('vr')} className={cn("p-2.5 rounded-2xl transition-all", activeTab === 'vr' ? "bg-zinc-900 text-white shadow-lg" : "text-zinc-400")}>
          <Coffee className="w-5 h-5" />
        </button>
        <button onClick={() => setActiveTab('vt')} className={cn("p-2.5 rounded-2xl transition-all", activeTab === 'vt' ? "bg-zinc-900 text-white shadow-lg" : "text-zinc-400")}>
          <Bus className="w-5 h-5" />
        </button>
      </div>

      {/* Floating Action Button */}
      <button 
        onClick={handleAddClick}
        className="fixed bottom-[calc(80px+env(safe-area-inset-bottom,12px))] right-4 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl shadow-emerald-300 flex items-center justify-center hover:scale-110 transition-transform active:scale-95 z-40 sm:bottom-10 sm:right-10 sm:w-16 sm:h-16"
      >
        <Plus className="w-7 h-7 sm:w-8 sm:h-8" />
      </button>

      {/* Add/Edit Transaction Modal */}
      <TransactionModal 
        isOpen={isAddModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveTransaction}
        onDelete={(id) => setTransactionToDelete(id)}
        editingTransaction={editingTransaction}
        categories={CATEGORIES}
        activeTab={activeTab}
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {transactionToDelete && (
          <div key="delete-confirm-overlay-container" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              key="delete-confirm-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTransactionToDelete(null)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              key="delete-confirm-content"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Excluir Transação?</h3>
              <p className="text-zinc-500 mb-8">Esta ação não pode ser desfeita. Tem certeza que deseja remover este registro?</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setTransactionToDelete(null)}
                  className="flex-1 py-3 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteTransaction(transactionToDelete)}
                  className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-100 transition-colors"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Batch Review Modal */}
      <AnimatePresence>
        {isBatchModalOpen && (
          <div key="batch-modal-overlay-container" className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              key="batch-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isBatchScanning && setIsBatchModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              key="batch-modal-content"              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full sm:max-w-3xl rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh] mt-auto sm:mt-0"
            >
              <div className="p-5 sm:p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 shrink-0">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-zinc-900">Revisar Fatura</h3>
                  <p className="text-xs sm:text-sm text-zinc-500">
                    {isBatchScanning ? 'Extraindo dados com IA...' : `${batchTransactions.length} transações encontradas`}
                  </p>
                </div>
                <button 
                  onClick={() => !isBatchScanning && setIsBatchModalOpen(false)} 
                  disabled={isBatchScanning}
                  className="p-2 hover:bg-zinc-200 rounded-full transition-colors disabled:opacity-50"
                >
                  <X className="w-6 h-6 text-zinc-500" />
                </button>
              </div>

              <div className="p-5 sm:p-6 overflow-y-auto flex-1">
                {isBatchScanning ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-4">
                    <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
                    <p className="text-zinc-500 font-medium animate-pulse">A IA está lendo sua fatura linha a linha...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {batchTransactions.map((t, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                        <div className="md:col-span-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase">Data</label>
                          <input 
                            type="date" 
                            value={t.date} 
                            onChange={(e) => {
                              const newBatch = [...batchTransactions];
                              newBatch[idx].date = e.target.value;
                              setBatchTransactions(newBatch);
                            }}
                            className="w-full bg-transparent font-bold text-zinc-900 outline-none text-base sm:text-sm h-10"
                          />
                        </div>
                        <div className="md:col-span-1 border-t border-zinc-100 sm:border-0 pt-2 sm:pt-0">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter sm:tracking-normal">Valor</label>
                          <div className="flex items-center gap-1 h-10">
                            <span className="text-zinc-400 font-bold text-xs">R$</span>
                            <input 
                              type="number" 
                              value={t.amount} 
                              onChange={(e) => {
                                const newBatch = [...batchTransactions];
                                newBatch[idx].amount = parseFloat(e.target.value);
                                setBatchTransactions(newBatch);
                              }}
                              className="w-full bg-transparent font-bold text-red-600 outline-none text-base sm:text-sm"
                            />
                          </div>
                        </div>
                        <div className="md:col-span-1 border-t border-zinc-100 sm:border-0 pt-2 sm:pt-0">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter sm:tracking-normal">Local</label>
                          <input 
                            type="text" 
                            value={t.description} 
                            onChange={(e) => {
                              const newBatch = [...batchTransactions];
                              newBatch[idx].description = e.target.value;
                              setBatchTransactions(newBatch);
                            }}
                            className="w-full bg-transparent font-bold text-zinc-900 outline-none truncate text-base sm:text-sm h-10"
                            placeholder="Estabelecimento"
                          />
                        </div>
                        <div className="md:col-span-1 border-t border-zinc-100 sm:border-0 pt-2 sm:pt-0">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter sm:tracking-normal">Item</label>
                          <input 
                            type="text" 
                            value={t.item} 
                            onChange={(e) => {
                              const newBatch = [...batchTransactions];
                              newBatch[idx].item = e.target.value;
                              setBatchTransactions(newBatch);
                            }}
                            className="w-full bg-transparent font-bold text-zinc-900 outline-none truncate text-base sm:text-sm h-10"
                            placeholder="Ex: Almoço"
                          />
                        </div>
                        <div className="md:col-span-1 border-t border-zinc-100 sm:border-0 pt-2 sm:pt-0">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter sm:tracking-normal">Categoria</label>
                          <select 
                            value={t.category} 
                            onChange={(e) => {
                              const newBatch = [...batchTransactions];
                              newBatch[idx].category = e.target.value;
                              setBatchTransactions(newBatch);
                            }}
                            className="w-full bg-transparent font-bold text-zinc-900 outline-none text-base sm:text-sm h-10"
                          >
                            {CATEGORIES.expense.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!isBatchScanning && (
                <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex gap-4">
                  <button
                    onClick={() => setIsBatchModalOpen(false)}
                    className="flex-1 py-4 px-6 rounded-2xl font-bold text-zinc-500 hover:bg-zinc-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveBatch}
                    className="flex-1 py-4 px-6 rounded-2xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2"
                  >
                    Salvar {batchTransactions.length} Transações
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Actions Bar */}
      {selectedTransactions.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-2xl">
          <div className="bg-zinc-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                {selectedTransactions.length}
              </div>
              <span className="font-medium text-sm">Selecionados</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsBulkEditModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-sm font-semibold"
              >
                <Edit2 className="w-4 h-4" />
                <span>Editar</span>
              </button>
              <button
                onClick={() => setIsBulkDeleteConfirmOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-colors text-sm font-semibold border border-red-500/30"
              >
                <Trash2 className="w-4 h-4" />
                <span>Excluir</span>
              </button>
              <button
                onClick={() => setSelectedTransactions([])}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      <AnimatePresence>
        {isBulkDeleteConfirmOpen && (
          <div key="bulk-delete-confirm-overlay-container" className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              key="bulk-delete-confirm-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBulkDeleteConfirmOpen(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              key="bulk-delete-confirm-content"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Excluir {selectedTransactions.length} Transações?</h3>
              <p className="text-zinc-500 mb-8">Esta ação não pode ser desfeita. Tem certeza que deseja remover estes registros?</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsBulkDeleteConfirmOpen(false)}
                  className="flex-1 py-3 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleBulkDelete}
                  className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-100 transition-colors"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Edit Modal */}
      <AnimatePresence>
        {isBulkEditModalOpen && (
          <div key="bulk-edit-overlay-container" className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              key="bulk-edit-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeBulkEditModal}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              key="bulk-edit-content"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl"
            >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-zinc-900">Edição em Massa</h3>
              <button onClick={closeBulkEditModal} className="p-2 hover:bg-zinc-100 rounded-full">
                <X className="w-6 h-6 text-zinc-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-500 mb-2 uppercase tracking-wider">Campo para Alterar</label>
                <select
                  value={bulkEditField || ''}
                  onChange={(e) => {
                    setBulkEditField(e.target.value as any);
                    setBulkEditValue('');
                  }}
                  className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">Selecione um campo</option>
                  <option value="category">Categoria</option>
                  <option value="paymentMethod">Forma de Pagamento</option>
                  <option value="bank">Banco do Cartão</option>
                  <option value="type">Tipo (Receita/Despesa)</option>
                  <option value="date">Data</option>
                </select>
              </div>

              {bulkEditField && (
                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-2 uppercase tracking-wider">Novo Valor</label>
                  {bulkEditField === 'category' ? (
                    <select
                      value={bulkEditValue}
                      onChange={(e) => setBulkEditValue(e.target.value)}
                      className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="">Selecione a categoria</option>
                      {[...CATEGORIES.income, ...CATEGORIES.expense].map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  ) : bulkEditField === 'paymentMethod' ? (
                    <select
                      value={bulkEditValue}
                      onChange={(e) => setBulkEditValue(e.target.value)}
                      className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="">Selecione o método</option>
                      <option value="other">Outros / Dinheiro</option>
                      <option value="credit_card">Cartão de Crédito</option>
                      <option value="vr">VR</option>
                      <option value="vt">VT</option>
                    </select>
                  ) : bulkEditField === 'bank' ? (
                    <input
                      type="text"
                      value={bulkEditValue}
                      onChange={(e) => setBulkEditValue(e.target.value)}
                      placeholder="Ex: Nubank, Itaú, Inter..."
                      className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  ) : bulkEditField === 'type' ? (
                    <select
                      value={bulkEditValue}
                      onChange={(e) => setBulkEditValue(e.target.value)}
                      className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="">Selecione o tipo</option>
                      <option value="income">Receita</option>
                      <option value="expense">Despesa</option>
                    </select>
                  ) : (
                    <input
                      type="date"
                      value={bulkEditValue}
                      onChange={(e) => setBulkEditValue(e.target.value)}
                      className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  )}
                </div>
              )}

              <button
                onClick={handleBulkEdit}
                disabled={!bulkEditField || !bulkEditValue || isBulkEditing}
                className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:shadow-none mt-4 flex items-center justify-center gap-2"
              >
                {isBulkEditing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Aplicar Alterações</span>
                )}
              </button>

              {bulkEditError && (
                <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{bulkEditError}</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

      {/* Drill-down Modal */}
      <AnimatePresence>
        {selectedCategoryForDrillDown && (
          <div key="drilldown-modal-overlay-container" className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              key="drilldown-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCategoryForDrillDown(null)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              key="drilldown-modal-content"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full sm:max-w-2xl rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh] mt-auto sm:mt-0"
            >
              <div className="p-5 sm:p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 shrink-0">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-zinc-900">Detalhes: {selectedCategoryForDrillDown}</h3>
                  <p className="text-xs sm:text-sm text-zinc-500">Gasto total: {chartData.find(c => c.name === selectedCategoryForDrillDown)?.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                </div>
                <button 
                  onClick={() => setSelectedCategoryForDrillDown(null)} 
                  className="p-2 hover:bg-zinc-200 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-zinc-500" />
                </button>
              </div>

              <div className="p-5 sm:p-6 overflow-y-auto">
                <div className="h-64 sm:h-80 w-full mb-6 sm:mb-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={drillDownData} layout="vertical" margin={{ left: 40, right: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f4f4f5" />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={120}
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#71717a', fontSize: 11 }}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f4f4f5' }}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      />
                      <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]}>
                        <LabelList 
                          dataKey="value" 
                          position="right" 
                          formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          style={{ fill: '#71717a', fontSize: 10, fontWeight: 'bold' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-zinc-900 text-sm uppercase tracking-wider mb-4">Lista de Lançamentos</h4>
                  {drillDownData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                          <ArrowDownRight className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900 text-sm">
                            {item.name}
                            {item.item && <span className="text-zinc-400 font-normal ml-1">• {item.item}</span>}
                          </p>
                          <p className="text-xs text-zinc-500">{item.date}</p>
                        </div>
                      </div>
                      <p className="font-bold text-red-600">
                        {item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        </AnimatePresence>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {isLogoutModalOpen && (
          <div key="logout-confirm-overlay-container" className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              key="logout-confirm-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogoutModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              key="logout-confirm-content"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <LogOut className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-zinc-900 mb-2 tracking-tight">Sair do App?</h3>
              <p className="text-zinc-500 mb-8 font-medium">Você precisará fazer login novamente para acessar seus dados.</p>
              
              <div className="flex flex-col gap-3">
                <button
                  onClick={confirmLogout}
                  className="w-full py-4 bg-red-600 text-white font-black rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 uppercase tracking-widest text-xs"
                >
                  Sim, Sair agora
                </button>
                <button
                  onClick={() => setIsLogoutModalOpen(false)}
                  className="w-full py-4 bg-zinc-100 text-zinc-600 font-black rounded-xl hover:bg-zinc-200 transition-all uppercase tracking-widest text-xs"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Welcome Modal */}
      <AnimatePresence>
        {showWelcomeModal && user && (
            <div key="welcome-modal-overlay-container" className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <motion.div 
                key="welcome-modal-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowWelcomeModal(false)}
                className="absolute inset-0 bg-zinc-900/40 backdrop-blur-md"
              />
              <motion.div 
                key="welcome-modal-content"
                initial={{ opacity: 0, scale: 0.8, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 40 }}
                className="relative bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl text-center overflow-hidden"
              >
                {/* Decorative background for welcome modal */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 to-emerald-500" />
                
                <div className="relative mb-8">
                  <div className="w-24 h-24 rounded-[2rem] overflow-hidden mx-auto border-4 border-white shadow-xl relative z-10">
                    <img src={user.photoURL || ''} className="w-full h-full object-cover" alt={user.displayName || ''} />
                  </div>
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3, type: 'spring' }}
                    className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 rounded-full border-4 border-white flex items-center justify-center text-white z-20 shadow-lg"
                  >
                    <Check className="w-5 h-5" />
                  </motion.div>
                </div>

                <h3 className="text-3xl font-black text-zinc-900 mb-2 tracking-tight">
                  Bem-vindo de volta!
                </h3>
                <p className="text-zinc-500 mb-8 font-medium">
                  Que bom ter você aqui, <span className="text-blue-600 font-bold">{user.displayName?.split(' ')[0]}</span>. Vamos cuidar das suas finanças?
                </p>
                
                <button
                  onClick={() => setShowWelcomeModal(false)}
                  className="w-full py-5 bg-zinc-900 text-white font-black rounded-2xl hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-900/20 uppercase tracking-widest text-xs flex items-center justify-center gap-3"
                >
                  Começar Agora
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </motion.div>
            </div>
          )}
      </AnimatePresence>
    </div>
  </div>
</ErrorBoundary>
  );
}

const Sidebar = ({ 
  activeTab, 
  setActiveTab, 
  isInstallable, 
  handleInstallClick, 
  handleLogout 
}: { 
  activeTab: string; 
  setActiveTab: (tab: any) => void;
  isInstallable: boolean;
  handleInstallClick: () => void;
  handleLogout: () => void;
}) => {
  const menuItems = [
    { id: 'history', label: 'Mensal', icon: History, fullLabel: 'Receitas e despesas mensal' },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, fullLabel: 'Dashboard' },
    { id: 'credit_card', label: 'Cartão', icon: PieChartIcon, fullLabel: 'Cartão de Crédito' },
    { id: 'vr', label: 'VR', icon: Coffee, fullLabel: 'Vale Refeição' },
    { id: 'vt', label: 'VT', icon: Bus, fullLabel: 'Vale Transporte' },
  ];

  return (
    <aside className="hidden md:flex w-20 lg:w-72 bg-white border-r border-zinc-200 flex-col sticky top-0 h-screen z-50 transition-all duration-300">
      <nav className="flex-1 px-3 py-8 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group relative",
              activeTab === item.id 
                ? "bg-zinc-900 text-white shadow-xl shadow-zinc-900/20" 
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
            )}
          >
            <item.icon className={cn(
              "w-6 h-6 shrink-0 transition-transform group-hover:scale-110",
              activeTab === item.id ? "text-blue-400" : "text-zinc-400 group-hover:text-zinc-600"
            )} />
            <span className="hidden lg:block font-bold text-sm tracking-tight">{item.fullLabel}</span>
            {activeTab === item.id && (
              <motion.div 
                layoutId="activeTabIndicator"
                className="absolute left-0 w-1 h-8 bg-blue-500 rounded-r-full lg:hidden"
              />
            )}
          </button>
        ))}
      </nav>

      <div className="p-6 border-t border-zinc-100">
        {isInstallable && (
          <button 
            onClick={handleInstallClick}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all group border border-blue-100 mb-3"
          >
            <Download className="w-6 h-6 shrink-0 group-hover:scale-110 transition-transform text-blue-600" />
            <span className="hidden lg:block font-bold text-sm tracking-tight text-left">Instalar no PC</span>
          </button>
        )}
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-4 p-4 rounded-2xl text-zinc-500 hover:bg-red-50 hover:text-red-600 transition-all group"
        >
          <LogOut className="w-6 h-6 shrink-0 group-hover:scale-110 transition-transform" />
          <span className="hidden lg:block font-bold text-sm tracking-tight">Sair da Conta</span>
        </button>
        
        <div className="mt-8 pt-8 border-t border-zinc-100 flex flex-col items-center justify-center transition-all duration-500 hover:scale-105">
          <div className="flex items-center gap-4">
            <EcsLogo variant="light" size={56} />
            <div className="flex flex-col leading-none hidden lg:flex">
              <span className="text-xl font-black text-[#06182c] tracking-tight">ECS</span>
              <span className="text-[10px] font-black text-[#06182c]/80 tracking-[0.5em] -mt-1">SYSTEMS</span>
            </div>
          </div>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em] mt-4 hidden lg:block">Engineering the Future</p>
        </div>
      </div>
    </aside>
  );
};
