import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, TrendingDown, TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon, Loader2, Sparkles, Save, Trash2, Calculator, Delete, Check, RotateCcw } from 'lucide-react';
import { format, parseISO, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Transaction {
  id: string;
  uid: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  item?: string;
  date: string;
  createdAt: any;
  paymentMethod?: 'credit_card' | 'other' | 'vr' | 'vt';
  isInstallment?: boolean;
  totalInstallments?: number;
  paidInstallments?: number;
  billingCycle?: 'current' | 'next';
  billingMonth?: string; // Format: YYYY-MM
  bank?: string;
  updatedAt?: any;
  isPaid?: boolean;
}

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transaction: Partial<Transaction>) => void;
  onDelete?: (id: string) => void;
  editingTransaction: Transaction | null;
  categories: { income: string[], expense: string[] };
  activeTab?: string;
}

export const TransactionModal = React.memo(({ 
  isOpen, 
  onClose, 
  onSave, 
  onDelete,
  editingTransaction, 
  categories,
  activeTab
}: TransactionModalProps) => {
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [item, setItem] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'other' | 'vr' | 'vt'>('other');
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalInstallments, setTotalInstallments] = useState('');
  const [paidInstallments, setPaidInstallments] = useState('');
  const [billingCycle, setBillingCycle] = useState<'current' | 'next'>('current');
  const [billingMonth, setBillingMonth] = useState('');
  const [bank, setBank] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [showUnsavedAlert, setShowUnsavedAlert] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [calcValue, setCalcValue] = useState('0');
  const [calcOperation, setCalcOperation] = useState<string | null>(null);
  const [calcPrevValue, setCalcPrevValue] = useState<string | null>(null);
  const [calcResetOnNext, setCalcResetOnNext] = useState(false);

  const handleCalcInput = (val: string) => {
    if (val === 'C') {
      setCalcValue('0');
      setCalcPrevValue(null);
      setCalcOperation(null);
      setCalcResetOnNext(false);
      return;
    }
    if (val === '⌫') {
      setCalcValue(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
      return;
    }
    if (val === '=') {
      if (calcOperation && calcPrevValue !== null) {
        const current = parseFloat(calcValue.replace(',', '.'));
        const prev = parseFloat(calcPrevValue.replace(',', '.'));
        let result = 0;
        switch (calcOperation) {
          case '+': result = prev + current; break;
          case '-': result = prev - current; break;
          case '*': result = prev * current; break;
          case '/': result = prev / current; break;
        }
        setCalcValue(result.toString().replace('.', ','));
        setCalcPrevValue(null);
        setCalcOperation(null);
        setCalcResetOnNext(true);
      }
      return;
    }
    if (['+', '-', '*', '/'].includes(val)) {
      if (calcOperation && calcPrevValue !== null && !calcResetOnNext) {
        // Chain operations
        const current = parseFloat(calcValue.replace(',', '.'));
        const prev = parseFloat(calcPrevValue.replace(',', '.'));
        let result = 0;
        switch (calcOperation) {
          case '+': result = prev + current; break;
          case '-': result = prev - current; break;
          case '*': result = prev * current; break;
          case '/': result = prev / current; break;
        }
        setCalcPrevValue(result.toString().replace('.', ','));
        setCalcValue(result.toString().replace('.', ','));
      } else {
        setCalcPrevValue(calcValue);
      }
      setCalcOperation(val);
      setCalcResetOnNext(true);
      return;
    }
    if (val === ',') {
      if (calcResetOnNext) {
        setCalcValue('0,');
        setCalcResetOnNext(false);
      } else if (!calcValue.includes(',')) {
        setCalcValue(prev => prev + ',');
      }
      return;
    }
    
    if (calcResetOnNext) {
      setCalcValue(val);
      setCalcResetOnNext(false);
    } else {
      setCalcValue(prev => prev === '0' ? val : prev + val);
    }
  };

  const applyCalcValue = () => {
    setAmount(calcValue.replace(',', '.'));
    setIsCalculatorOpen(false);
  };

  useEffect(() => {
    if (editingTransaction) {
      setAmount(editingTransaction.amount.toString());
      setType(editingTransaction.type);
      setCategory(editingTransaction.category);
      setDescription(editingTransaction.description);
      setItem(editingTransaction.item || '');
      setDate(format(parseISO(editingTransaction.date), 'yyyy-MM-dd'));
      setPaymentMethod(editingTransaction.paymentMethod || 'other');
      setIsInstallment(editingTransaction.isInstallment || false);
      setTotalInstallments(editingTransaction.totalInstallments?.toString() || '');
      setPaidInstallments(editingTransaction.paidInstallments?.toString() || '');
      setBillingCycle(editingTransaction.billingCycle || 'current');
      setBillingMonth(editingTransaction.billingMonth || '');
      setBank(editingTransaction.bank || '');
      setIsPaid(editingTransaction.isPaid || false);
    } else {
      setAmount('');
      setType('expense');
      setCategory(categories.expense[0]);
      setDescription('');
      setItem('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setPaymentMethod(
        activeTab === 'credit_card' ? 'credit_card' : 
        activeTab === 'vr' ? 'vr' :
        activeTab === 'vt' ? 'vt' :
        'other'
      );
      setIsInstallment(false);
      setTotalInstallments('');
      setPaidInstallments('');
      setBillingCycle('current');
      setBillingMonth('');
      setBank('');
      setIsPaid(false);
    }
  }, [editingTransaction, categories, isOpen, activeTab]);

  const isDirty = useMemo(() => {
    if (editingTransaction) {
      const initialDate = format(parseISO(editingTransaction.date), 'yyyy-MM-dd');
      return (
        amount !== editingTransaction.amount.toString() ||
        type !== editingTransaction.type ||
        category !== editingTransaction.category ||
        description !== editingTransaction.description ||
        item !== (editingTransaction.item || '') ||
        date !== initialDate ||
        paymentMethod !== (editingTransaction.paymentMethod || 'other') ||
        isInstallment !== (editingTransaction.isInstallment || false) ||
        totalInstallments !== (editingTransaction.totalInstallments?.toString() || '') ||
        paidInstallments !== (editingTransaction.paidInstallments?.toString() || '') ||
        billingCycle !== (editingTransaction.billingCycle || 'current') ||
        billingMonth !== (editingTransaction.billingMonth || '') ||
        bank !== (editingTransaction.bank || '') ||
        isPaid !== (editingTransaction.isPaid || false)
      );
    } else {
      return (
        amount !== '' ||
        type !== 'expense' ||
        category !== categories.expense[0] ||
        description !== '' ||
        item !== '' ||
        date !== format(new Date(), 'yyyy-MM-dd') ||
        paymentMethod !== (
          activeTab === 'credit_card' ? 'credit_card' : 
          activeTab === 'vr' ? 'vr' :
          activeTab === 'vt' ? 'vt' :
          'other'
        ) ||
        isInstallment !== false ||
        totalInstallments !== '' ||
        paidInstallments !== '' ||
        billingCycle !== 'current' ||
        billingMonth !== '' ||
        bank !== '' ||
        isPaid !== false
      );
    }
  }, [amount, type, category, description, item, date, paymentMethod, isInstallment, totalInstallments, paidInstallments, billingCycle, bank, editingTransaction, categories, activeTab]);

  const handleClose = () => {
    if (isDirty) {
      setShowUnsavedAlert(true);
    } else {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    
    setIsSaving(true);
    setSaveError(null);
    try {
      const transactionData: Partial<Transaction> = {
        amount: parseFloat(amount),
        type,
        category,
        description,
        item,
        date,
        paymentMethod,
        isInstallment: paymentMethod === 'credit_card' ? isInstallment : false,
        isPaid
      };

      if (paymentMethod === 'credit_card') {
        transactionData.bank = bank;
        if (isInstallment) {
          transactionData.totalInstallments = parseInt(totalInstallments) || 1;
          transactionData.paidInstallments = parseInt(paidInstallments) || 0;
        } else {
          transactionData.billingCycle = billingCycle;
          if (billingCycle === 'next' && billingMonth) {
            transactionData.billingMonth = billingMonth;
          }
        }
      }

      await onSave(transactionData);
    } catch (error: any) {
      console.error("Erro ao salvar transação:", error);
      let errorMessage = "Erro ao salvar transação. Verifique sua conexão.";
      
      if (error.message) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed.error) errorMessage = `Erro: ${parsed.error}`;
          if (parsed.error && parsed.error.includes('permission-denied')) {
            errorMessage = "Permissão negada. Verifique as regras de segurança.";
          }
        } catch (e) {
          if (error.message.includes('permission-denied')) {
            errorMessage = "Permissão negada. Verifique as regras de segurança.";
          }
        }
      }
      setSaveError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        if (!base64Data) return;

        try {
          const response = await fetch("/api/ai/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: {
                parts: [
                  {
                    inlineData: {
                      data: base64Data,
                      mimeType: file.type
                    }
                  },
                  {
                    text: "Analise este documento (PDF ou Imagem) de transação financeira e extraia os seguintes dados em formato JSON: valor (number), tipo (string: 'income' ou 'expense'), categoria (string baseada nas categorias: Alimentação, Transporte, Lazer, Saúde, Educação, Moradia, Doação, Poupança do filho, Fatura do Cartão, Despesas com o carro, Celular, Vestuário, Salário, Investimentos, Presente, Outros), estabelecimento (string), item adquirido (string, se disponível), data (string: YYYY-MM-DD), e se for uma compra parcelada no cartão, extraia isInstallment (boolean), totalInstallments (number) e paidInstallments (number). Se não encontrar algum dado, tente inferir ou deixe vazio."
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
          if (!textResponse) {
            throw new Error("Resposta da IA vazia");
          }

          const result = JSON.parse(textResponse);
          if (result) {
            setAmount(result.amount?.toString() || '');
            setType(result.type || 'expense');
            setCategory(result.category || '');
            setDescription(result.description || '');
            setItem(result.item || '');
            setDate(result.date || format(new Date(), 'yyyy-MM-dd'));
            if (result.isInstallment !== undefined) {
              setIsInstallment(result.isInstallment);
              if (result.isInstallment) setPaymentMethod('credit_card');
            }
            if (result.totalInstallments) setTotalInstallments(result.totalInstallments.toString());
            if (result.paidInstallments) setPaidInstallments(result.paidInstallments.toString());
          }
          setIsScanning(false);
        } catch (err) {
          console.error("Erro ao processar resposta da IA:", err);
          setSaveError("Não foi possível processar o documento automaticamente. Verifique se a chave de API (GEMINI_API_KEY) está configurada.");
          setIsScanning(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro ao escanear arquivo:", error);
      setIsScanning(false);
    }
  };

  // We need to sync the state if the parent updates it (e.g. after scanning)
  // This is a bit tricky with isolated state, but we can use a ref or just update when props change
  // Actually, the scan result should probably be passed back to the modal
  // For now, let's assume the parent will call a callback that updates the modal's internal state
  // But since we want to isolate state, the scan logic should probably be inside the modal or use a ref

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div key="transaction-modal-overlay-container" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              key="transaction-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              key="transaction-modal-content"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95dvh] sm:max-h-[90dvh] mt-auto sm:mt-0 pb-[env(safe-area-inset-bottom)]"
            >
              <div className="p-4 sm:p-6 border-b border-zinc-100 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-base sm:text-xl font-bold">{editingTransaction ? 'Editar Transação' : 'Nova Transação'}</h3>
                  {isDirty && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-600 rounded-full border border-amber-100"
                    >
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Pendente</span>
                    </motion.div>
                  )}
                </div>
                <button onClick={handleClose} className="p-2 hover:bg-zinc-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto">
                {!editingTransaction && (
                  <>
                    <div className="relative">
                      <input 
                        type="file" 
                        accept="application/pdf,image/*" 
                        onChange={handleFileUpload}
                        className="hidden" 
                        id="pdf-upload"
                        disabled={isScanning}
                      />
                      <label 
                        htmlFor="pdf-upload"
                        className={cn(
                          "w-full flex items-center justify-center gap-3 p-3 sm:p-4 border-2 border-dashed border-emerald-200 rounded-2xl cursor-pointer transition-all",
                          isScanning ? "bg-emerald-50 border-emerald-400 cursor-not-allowed" : "hover:bg-emerald-50 hover:border-emerald-400"
                        )}
                      >
                        {isScanning ? (
                          <>
                            <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                            <span className="text-emerald-600 font-semibold text-sm">Escaneando...</span>
                          </>
                        ) : (
                          <>
                            <div className="p-2 bg-emerald-100 rounded-xl">
                              <Sparkles className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div className="text-left">
                              <p className="text-emerald-700 font-bold text-sm">Escanear com IA</p>
                              <p className="text-emerald-600/60 text-[10px] sm:text-xs">Preenchimento automático</p>
                            </div>
                          </>
                        )}
                      </label>
                    </div>

                    <div className="relative flex items-center gap-4">
                      <div className="h-px bg-zinc-100 flex-1" />
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">ou manual</span>
                      <div className="h-px bg-zinc-100 flex-1" />
                    </div>
                  </>
                )}

                <div className="flex p-1 bg-zinc-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setType('income');
                      setCategory(categories.income[0]);
                    }}
                    className={cn(
                      "flex-1 py-2 sm:py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-xs sm:text-sm",
                      type === 'income' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-500"
                    )}
                  >
                    <TrendingUp className="w-4 h-4" />
                    Receita
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setType('expense');
                      setCategory(categories.expense[0]);
                    }}
                    className={cn(
                      "flex-1 py-2 sm:py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-xs sm:text-sm",
                      type === 'expense' ? "bg-white text-red-600 shadow-sm" : "text-zinc-500"
                    )}
                  >
                    <TrendingDown className="w-4 h-4" />
                    Despesa
                  </button>
                </div>

                {saveError && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600 text-sm">
                    <div className="p-1 bg-red-100 rounded-lg">
                      <X className="w-4 h-4" />
                    </div>
                    <p className="font-medium">{saveError}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-bold text-zinc-700">Valor</label>
                      <button 
                        type="button"
                        onClick={() => {
                          setCalcValue(amount.replace('.', ',') || '0');
                          setIsCalculatorOpen(true);
                        }}
                        className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                      >
                        <Calculator className="w-3.5 h-3.5" />
                        Calculadora
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-zinc-400">R$</span>
                      <input 
                        type="number" 
                        step="0.01"
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0,00"
                        className="w-full pl-12 pr-4 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none font-bold text-base sm:text-xl"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-zinc-700 mb-2">Categoria</label>
                      <select 
                        required
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-4 py-3 sm:py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-base"
                      >
                        <option value="" disabled>Selecione...</option>
                        {categories[type].map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-zinc-700 mb-2">Forma de Pagamento</label>
                      <select 
                        required
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as 'credit_card' | 'other' | 'vr' | 'vt')}
                        className="w-full px-4 py-3 sm:py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-base"
                      >
                        <option value="other">Outros / Dinheiro</option>
                        <option value="credit_card">Cartão de Crédito</option>
                        <option value="vr">VR</option>
                        <option value="vt">VT</option>
                      </select>
                    </div>
                  </div>

                  {paymentMethod === 'credit_card' && (
                    <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center">
                          <input 
                            type="checkbox"
                            checked={isInstallment}
                            onChange={(e) => setIsInstallment(e.target.checked)}
                            className="peer sr-only"
                          />
                          <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </div>
                        <span className="text-sm font-bold text-zinc-700">Compra Parcelada?</span>
                      </label>

                      {isInstallment && (
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div>
                            <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Total de Parcelas</label>
                            <input 
                              type="number" 
                              min="1"
                              required={isInstallment}
                              value={totalInstallments}
                              onChange={(e) => setTotalInstallments(e.target.value)}
                              placeholder="Ex: 12"
                              className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-base"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Parcelas Pagas</label>
                            <input 
                              type="number" 
                              min="0"
                              required={isInstallment}
                              value={paidInstallments}
                              onChange={(e) => setPaidInstallments(e.target.value)}
                              placeholder="Ex: 3"
                              className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-base"
                            />
                          </div>
                        </div>
                      )}

                      {!isInstallment && (
                        <div className="pt-2 space-y-3">
                          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Ciclo de Faturamento</label>
                          <div className="flex p-1 bg-white border border-zinc-200 rounded-xl">
                            <button
                              type="button"
                              onClick={() => {
                                setBillingCycle('current');
                                setBillingMonth('');
                              }}
                              className={cn(
                                "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                                billingCycle === 'current' ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-50"
                              )}
                            >
                              Mês Atual
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setBillingCycle('next');
                                // Initialize with next month of current date
                                const d = parseISO(date);
                                const nextMonth = addMonths(d, 1);
                                setBillingMonth(format(nextMonth, 'yyyy-MM'));
                              }}
                              className={cn(
                                "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                                billingCycle === 'next' ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-50"
                              )}
                            >
                              Próximo Mês
                            </button>
                          </div>

                          {billingCycle === 'next' && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="pt-1"
                            >
                              <label className="block text-[10px] font-bold text-zinc-400 mb-1 uppercase tracking-wider">Escolher Mês de Faturamento</label>
                              <select
                                value={billingMonth}
                                onChange={(e) => setBillingMonth(e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-base font-bold"
                              >
                                {(() => {
                                  const baseDate = parseISO(date);
                                  if (isNaN(baseDate.getTime())) return null;
                                  
                                  return Array.from({ length: 24 }).map((_, i) => {
                                    const d = addMonths(baseDate, i);
                                    const val = format(d, 'yyyy-MM');
                                    const label = format(d, 'MMMM / yyyy', { locale: ptBR });
                                    return (
                                      <option key={val} value={val}>{label}</option>
                                    );
                                  });
                                })()}
                              </select>
                            </motion.div>
                          )}
                        </div>
                      )}

                      <div className="pt-2">
                        <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Banco do Cartão</label>
                        <input 
                          type="text" 
                          value={bank}
                          onChange={(e) => setBank(e.target.value)}
                          placeholder="Ex: Nubank, Itaú, Inter..."
                          className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-base"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-zinc-700 mb-2">Data</label>
                      <input 
                        type="date" 
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full px-4 py-3 sm:py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-base"
                      />
                    </div>
                    <div className="flex flex-col justify-end pb-1">
                      <label className="flex items-center gap-3 cursor-pointer group mb-2 p-2 sm:p-0">
                        <div className="relative flex items-center">
                          <input 
                            type="checkbox"
                            checked={isPaid}
                            onChange={(e) => setIsPaid(e.target.checked)}
                            className="peer sr-only"
                          />
                          <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </div>
                        <span className="text-sm font-bold text-zinc-700">Pago / Recebido?</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-sm font-bold text-zinc-700 mb-2">Estabelecimento</label>
                      <input 
                        type="text" 
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Ex: Supermercado, Posto..."
                        className="w-full px-4 py-3 sm:py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-base"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-zinc-700 mb-2">Item Adquirido</label>
                      <input 
                        type="text" 
                        value={item}
                        onChange={(e) => setItem(e.target.value)}
                        placeholder="Ex: Arroz, Gasolina..."
                        className="w-full px-4 py-3 sm:py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-base"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 shrink-0">
                  {editingTransaction && onDelete && (
                    <button 
                      type="button"
                      onClick={() => {
                        onDelete(editingTransaction.id);
                        onClose();
                      }}
                      className="flex-1 py-3 sm:py-4 rounded-2xl font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base"
                    >
                      <Trash2 className="w-5 h-5" />
                      Excluir
                    </button>
                  )}
                  <button 
                    type="submit"
                    disabled={isScanning || isSaving}
                    className={cn(
                      "flex-1 py-3 sm:py-4 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base",
                      type === 'income' ? "bg-emerald-600 shadow-emerald-100 hover:bg-emerald-700" : "bg-red-600 shadow-red-100 hover:bg-red-700"
                    )}
                  >
                    {isSaving ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save className="w-5 h-5" />
                    )}
                    {isSaving ? 'Salvando...' : 'Salvar Transação'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Calculator Modal */}
      <AnimatePresence>
        {isCalculatorOpen && (
          <div key="calculator-modal-overlay-container" className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              key="calculator-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCalculatorOpen(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              key="calculator-modal-content"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-[320px] rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-4 bg-zinc-900 text-white">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Calculadora</span>
                  <button onClick={() => setIsCalculatorOpen(false)} className="p-1 hover:bg-white/10 rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-right py-4">
                  <div className="text-zinc-400 text-sm h-6 mb-1">
                    {calcPrevValue} {calcOperation}
                  </div>
                  <div className="text-4xl font-bold truncate">
                    {calcValue}
                  </div>
                </div>
              </div>

              <div className="p-4 grid grid-cols-4 gap-2 bg-zinc-50">
                {['C', '⌫', '/', '*'].map(btn => (
                  <button 
                    key={btn}
                    type="button"
                    onClick={() => handleCalcInput(btn)}
                    className={cn(
                      "h-14 rounded-2xl font-bold text-lg flex items-center justify-center transition-all active:scale-95",
                      ['/', '*'].includes(btn) ? "bg-emerald-100 text-emerald-600" : "bg-zinc-200 text-zinc-600"
                    )}
                  >
                    {btn}
                  </button>
                ))}
                {['7', '8', '9', '-'].map(btn => (
                  <button 
                    key={btn}
                    type="button"
                    onClick={() => handleCalcInput(btn)}
                    className={cn(
                      "h-14 rounded-2xl font-bold text-lg flex items-center justify-center transition-all active:scale-95",
                      btn === '-' ? "bg-emerald-100 text-emerald-600" : "bg-white text-zinc-700 shadow-sm"
                    )}
                  >
                    {btn}
                  </button>
                ))}
                {['4', '5', '6', '+'].map(btn => (
                  <button 
                    key={btn}
                    type="button"
                    onClick={() => handleCalcInput(btn)}
                    className={cn(
                      "h-14 rounded-2xl font-bold text-lg flex items-center justify-center transition-all active:scale-95",
                      btn === '+' ? "bg-emerald-100 text-emerald-600" : "bg-white text-zinc-700 shadow-sm"
                    )}
                  >
                    {btn}
                  </button>
                ))}
                <div className="grid grid-cols-3 col-span-3 gap-2">
                  {['1', '2', '3', '0', ',', '='].map(btn => (
                    <button 
                      key={btn}
                      type="button"
                      onClick={() => handleCalcInput(btn)}
                      className={cn(
                        "h-14 rounded-2xl font-bold text-lg flex items-center justify-center transition-all active:scale-95",
                        btn === '=' ? "bg-emerald-600 text-white col-span-1" : "bg-white text-zinc-700 shadow-sm"
                      )}
                    >
                      {btn}
                    </button>
                  ))}
                </div>
                <button 
                  type="button"
                  onClick={applyCalcValue}
                  className="h-14 rounded-2xl bg-zinc-900 text-white font-bold flex items-center justify-center transition-all active:scale-95 shadow-lg"
                >
                  <Check className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unsaved Changes Confirmation Modal */}
      <AnimatePresence>
        {showUnsavedAlert && (
          <div key="unsaved-alert-overlay-container" className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              key="unsaved-alert-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUnsavedAlert(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              key="unsaved-alert-content"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <X className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Alterações não salvas</h3>
              <p className="text-zinc-500 mb-8">Você tem alterações não salvas. Deseja realmente sair sem salvar?</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowUnsavedAlert(false)}
                  className="flex-1 py-3 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-colors"
                >
                  Continuar
                </button>
                <button 
                  onClick={() => {
                    setShowUnsavedAlert(false);
                    onClose();
                  }}
                  className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors"
                >
                  Sair
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
});
