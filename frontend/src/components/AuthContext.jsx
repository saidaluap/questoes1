import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // importe seu client Supabase no topo do arquivo

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL;
  const API_BASE_URL = `${API_URL}/api`;

 useEffect(() => {
  const syncSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setToken(session.access_token);
      setUser(session.user);
    } else {
      setToken(null);
      setUser(null);
    }
    setLoading(false);
  };

  syncSession();

  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    setToken(session?.access_token ?? null);
    setUser(session?.user ?? null);
  });

  return () => {
    listener?.subscription.unsubscribe();
  };
}, []);


  const fetchProfile = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.data.user);
      } else {
        // Token inválido
        logout();
      }
    } catch (error) {
      console.error('Erro ao buscar perfil:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };


const login = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('Erro no login:', error);
    return { success: false, message: error.message };
  }
  setToken(data.session.access_token);
  setUser(data.user);
  localStorage.setItem('token', data.session.access_token);
  return { success: true };
};


  const register = async (userData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.data.token);
        setUser(data.data.user);
        localStorage.setItem('token', data.data.token);
        return { success: true };
      } else {
        return { success: false, message: data.message, errors: data.errors };
      }
    } catch (error) {
      console.error('Erro no cadastro:', error);
      return { success: false, message: 'Erro de conexão' };
    }
  };

  const logout = async () => {
  await supabase.auth.signOut();
  setUser(null);
  setToken(null);
  localStorage.removeItem('token');
};


  const exportUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/export`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `usuarios_ortopedia_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        return { success: true };
      } else {
        return { success: false, message: 'Erro ao exportar usuários' };
      }
    } catch (error) {
      console.error('Erro na exportação:', error);
      return { success: false, message: 'Erro de conexão' };
    }
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    exportUsers,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

