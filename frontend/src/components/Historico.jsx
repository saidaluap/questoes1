import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import CountUp from 'react-countup';

function Historico() {
  const { token } = useAuth();
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [stats, setStats] = useState({
  total_respostas: 0,
  total_acertos: 0,
  total_erros: 0,
  taxa_acerto: 0
});

  const API_URL = import.meta.env.VITE_API_URL;
  const API_BASE_URL = `${API_URL}/api`;

  const [expandedQuestions, setExpandedQuestions] = useState({});

  const ITEMS_PER_PAGE = 10;

const [filtroTipo, setFiltroTipo] = useState('');
const [filtroArea, setFiltroArea] = useState('');
const [filtroAno, setFiltroAno] = useState('');

  const fetchHistorico = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
        if (searchTerm.trim()) params.append('palavraChave', searchTerm.trim());
        if (filtroTipo) params.append('tipo', filtroTipo);
        if (filtroArea) params.append('area', filtroArea);
        if (filtroAno) params.append('ano', filtroAno); 
      //params.append('page', currentPage);
      //params.append('limit', ITEMS_PER_PAGE);

      // Buscar histórico
      const response = await fetch(`${API_URL}/api/historico?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setHistorico(data.data);
        console.log('Dados recebidos:', data.data);
        //setTotalPages(data.pagination.totalPages);
        setTotalPages(data.pagination ? data.pagination.totalPages : 1);
      } else {
        const errorData = await response.json();
       // setError(errorData.message || 'Erro ao carregar histórico');
      }
    } finally {
      setLoading(false);
    }
  };



  // Buscar estatísticas
  
  console.log("Token usado em fetchStats:", token);
  
  const fetchStats = async () => {
    try {
    const params = new URLSearchParams();
    if (filtroTipo) params.append('tipo', filtroTipo);
    if (filtroArea) params.append('area', filtroArea);
    if (filtroAno) params.append('ano', filtroAno);
    if (searchTerm.trim()) params.append('palavraChave', searchTerm.trim());

    const response = await fetch(`${API_URL}/api/historico/estatisticas-filtrado?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      setStats(data.data);
    }
  } catch (error) {
    console.error('Erro ao buscar estatísticas filtradas:', error);
  }
};


  useEffect(() => {
  fetchHistorico();
  fetchStats();
  }, [token, currentPage, filtroTipo, filtroArea, filtroAno, searchTerm]);


  const handleSearch = () => {
    setCurrentPage(1);
    fetchHistorico();
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setCurrentPage(1);
    setTimeout(() => {
      fetchHistorico();
    }, 100);
  };

  const handleDeleteResposta = async (id) => {
    if (!window.confirm('Tem certeza que deseja deletar esta resposta? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/historico/deletar-resposta/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        // Remover do localStorage também
        const historicoLocal = JSON.parse(localStorage.getItem('historico_respostas') || '[]');
        const respostaParaDeletar = historico.find(r => r.id === id);
        if (respostaParaDeletar) {
          const historicoFiltrado = historicoLocal.filter(r => r.questao_id !== respostaParaDeletar.questao_id);
          localStorage.setItem('historico_respostas', JSON.stringify(historicoFiltrado));
        }

        // Recarregar dados
        fetchHistorico();
        fetchStats();
        alert('Resposta deletada com sucesso!');
      } else {
        const errorData = await response.json();
        alert(errorData.message || 'Erro ao deletar resposta');
      }
    } catch (error) {
      console.error('Erro ao deletar resposta:', error);
      alert('Erro de conexão ao deletar resposta');
    }
  };

  const toggleQuestionExpansion = (id) => {
    setExpandedQuestions(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const renderPagination = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // Botão Previous
    if (currentPage > 1) {
      pages.push(
        <button
          key="prev"
          onClick={() => goToPage(currentPage - 1)}
          className="pagination-btn"
        >
          ◀ Anterior
        </button>
      );
    }

    // Números das páginas
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => goToPage(i)}
          className={`pagination-btn ${i === currentPage ? 'active' : ''}`}
        >
          {i}
        </button>
      );
    }

    // Botão Next
    if (currentPage < totalPages) {
      pages.push(
        <button
          key="next"
          onClick={() => goToPage(currentPage + 1)}
          className="pagination-btn"
        >
          Próximo ▶
        </button>
      );
    }

    return pages;
  };

  return (
    <div className="historico-container">
      <div className="historico-header">
        <h2>📚 Histórico de Respostas</h2>
        <p>Visualize e gerencie suas respostas anteriores</p>
      </div>

{/* Estatísticas */}
<div className="stats-grid">
  <div className="stat-card blue">
    <div className="stat-number">
      <CountUp start={0} end={parseInt(stats.total_respostas || 0, 10)} duration={1.0} />
    </div>
    <div className="stat-label">Total de Respostas</div>
  </div>
  <div className="stat-card green">
    <div className="stat-number">
      <CountUp start={0} end={parseInt(stats.total_acertos || 0, 10)} duration={1.0} />
    </div>
    <div className="stat-label">Acertos</div>
  </div>
  <div className="stat-card red">
    <div className="stat-number">
      <CountUp start={0} end={parseInt(stats.total_erros || 0, 10)} duration={1.0} />
    </div>
    <div className="stat-label">Erros</div>
  </div>
  <div className="stat-card purple">
    <div className="stat-number">{stats.taxa_acerto}%</div>
    <div className="stat-label">Taxa de Acerto</div>
  </div>
</div>


      {/* Barra de pesquisa */}
<div className="search-container">
  <div className="search-input-group" style={{
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",   // espaçamento entre filtros
    alignItems: "center",
    justifyContent: "flex-start" // ou "center"
  }}>
    <input
      type="text"
      placeholder="Pesquisar"
      className="search-input"
      value={searchTerm}
      onChange={e => setSearchTerm(e.target.value)}
      onKeyPress={e => e.key === 'Enter' && handleSearch()}
      style={{ flex: "2 1 250px", minWidth: 220 }}
    />
    <select
      value={filtroTipo}
      onChange={e => setFiltroTipo(e.target.value)}
      className="search-input"
      style={{ flex: "1 1 140px", minWidth: 120 }}
    >
      <option value="">Tipo de Prova</option>
      <option value="TEOT">TEOT</option>
      <option value="TARO">TARO</option>
    </select>
    <select
      value={filtroArea}
      onChange={e => setFiltroArea(e.target.value)}
      className="search-input"
      style={{ flex: "1 1 140px", minWidth: 120 }}
    >
                  <option value="">Selecione...</option>
                  <option value="Ortopedia">Ortopedia</option>
                  <option value="Trauma">Traumatologia</option>
                  <option value="Ortopedia Pediátrica">Ortopedia Pediátrica</option>
                  <option value="Coluna">Coluna</option>
                  <option value="Mão">Mão</option>
                  <option value="Joelho">Joelho</option>
                  <option value="Quadril">Quadril</option>
                  <option value="Ombro">Ombro</option>
                  <option value="Pé e Tornozelo">Pé e Tornozelo</option>
                  <option value="Tumores">Tumores</option>
                  <option value="Infecção">Infecção</option>
                </select>
    <select
      value={filtroAno}
      onChange={e => setFiltroAno(e.target.value)}
      className="search-input"
      style={{ flex: "1 1 100px", minWidth: 100 }}
    >
      <option value="">Ano</option>
        <option value="2018">2018</option>
        <option value="2019">2019</option>
        <option value="2020">2020</option>
        <option value="2021">2021</option>
        <option value="2022">2022</option>
        <option value="2023">2023</option>
        <option value="2024">2024</option>
        <option value="2025">2025</option>
    </select>
    <button onClick={handleSearch} className="btn btn-search">
      🔍 Pesquisar
    </button>
    {(searchTerm || filtroTipo || filtroArea || filtroAno) && (
      <button onClick={handleClearSearch} className="btn btn-clear">
        ✕ Limpar
      </button>
    )}
  </div>
</div>


      {/* Lista do histórico */}
      <div className="historico-content">
        {loading && <p>Carregando histórico...</p>}
        {error && (!historico || historico.length === 0) && (
  <div className="alert alert-danger">
    <b>Erro</b>
    <br />
    {error}
    <br />
    {searchTerm ? 'Tente pesquisar com outros termos ou limpe o filtro.' : 'Você ainda não respondeu nenhuma questão. Vá para o banco de questões e comece a praticar!' }
  </div>
)}

        {!loading && !error && historico.length === 0 && (
          <div className="empty-state">
            <h3>📝 Nenhuma resposta encontrada</h3>
            <p>
              {searchTerm 
                ? 'Tente pesquisar com outros termos ou limpe o filtro.'
                : 'Você ainda não respondeu nenhuma questão. Vá para o banco de questões e comece a praticar!'
              }
            </p>
          </div>
        )}

{Array.isArray(historico) && historico.map((resposta, index) => {
  const respostaId = resposta.id ?? String(index);
  const isExpanded = expandedQuestions[respostaId];
  const questionNumber = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;

  return (
    <div key={respostaId} className="historico-item" style={{ display: 'grid', gridTemplateColumns: '64px 2fr 1fr 1fr 1fr', alignItems: 'center', marginBottom: 18, boxShadow: '0 1px 6px #ede9fe', borderRadius: 12, background: '#fff', padding: '18px 15px' }}>
      
      {/* Número */}
      <div style={{ justifySelf: 'center' }}>
        <div className="number-circle" style={{ width: 40, height: 40, fontSize: '1.1em' }}>
          {questionNumber}
        </div>
      </div>

      {/* Questão */}
      <div style={{ fontWeight: 500 }}>
        <div style={{ color: '#6c7bd8', fontWeight: 600, fontSize: '1.04em' }}>
          ID QUESTÃO: {String(resposta.questao_id)} {String(resposta.tipo)} {String(resposta.ano)}
        </div>
        <div style={{ fontStyle: 'italic', color: '#222', fontSize: '1em', marginTop: 3 }}>
          "{typeof resposta.questao === 'string' ? resposta.questao : ''}"
        </div>
      </div>

      {/* Resposta Usuário */}
      <div style={{ fontSize: '1em' }}>
        <div>
          <span style={{ color: '#222' }}>Sua resposta: </span>
          <strong>{String(resposta.resposta_usuario ?? '')}</strong>
        </div>
        <div>
          <span style={{ color: '#888' }}>Correta: </span>
          <strong>{String(resposta.resposta_correta ?? '')}</strong>
        </div>
      </div>

      {/* Status & Data */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <span className={resposta.acertou ? "status-success" : "status-error"} style={{ padding: '2px 14px', borderRadius: 12 }}>
          {resposta.acertou ? "✓ Acertou" : "✗ Errou"}
        </span>
        <span style={{ fontSize: '0.85em', color: '#777' }}>
          {resposta.data_resposta ? new Date(resposta.data_resposta).toLocaleString('pt-BR') : ''}
        </span>
      </div>

      {/* Botões */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={() => toggleQuestionExpansion(respostaId)} className="btn btn-expand" style={{ marginBottom: 4 }}>
          {isExpanded ? '▲ Ocultar' : '▼ Ver Questão'}
        </button>
        <button onClick={() => handleDeleteResposta(respostaId)} className="btn btn-delete">
          🗑️ Deletar
        </button>
      </div>

      {/* Detalhes expandido */}
      {isExpanded && (
        <div
          className="question-details"
          style={{ gridColumn: '1 / -1', marginTop: 12, background: '#f8fafc', borderRadius: 8, padding: 10 }}
        >
          <div className="question-text">
            {typeof resposta.questao === 'string' ? resposta.questao : ''}
          </div>
          {Array.isArray(resposta.alternativas) && (
            <div className="alternatives">
              {resposta.alternativas.map((alt, altIndex) => {
                const isUserAnswer = alt.letra === resposta.resposta_usuario;
                const isCorrectAnswer = alt.letra === resposta.resposta_correta;
                let className = 'alternative';
                if (isCorrectAnswer) className += ' correct-answer';
                if (isUserAnswer && !isCorrectAnswer) className += ' incorrect-answer';
                return (
                  <div key={String(altIndex)} className={className} style={{ marginBottom: 6 }}>
                    <span className="alternative-letter">{String(alt.letra)}:</span> {String(alt.texto)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
})}




        {/* Paginação */}
        {totalPages > 1 && (
          <div className="pagination">
            {renderPagination()}
          </div>
        )}
      </div>
    </div>
  );
}

export default Historico;

