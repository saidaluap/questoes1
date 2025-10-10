// server_integrado.js
require('dotenv').config();
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

const supabase = require('./supabaseClient');
const user = supabase.auth.getUser();


app.use(cors());
app.use(express.json());
console.log("DEPLOY VERSION CHECADA 07/10/2025 16:50");


// Caminho para o arquivo Excel
const EXCEL_FILE_PATH = path.join(__dirname, "usuarios_ortopedia.xlsx");

// Função para atualizar planilha Excel
const updateExcelFile = (userData) => {
  try {
    let workbook;
    let worksheet;
    
    // Verificar se o arquivo já existe
    if (fs.existsSync(EXCEL_FILE_PATH)) {
      workbook = XLSX.readFile(EXCEL_FILE_PATH);
      worksheet = workbook.Sheets['Usuários'] || workbook.Sheets[workbook.SheetNames[0]];
    } else {
      // Criar nova planilha se não existir
      workbook = XLSX.utils.book_new();
      worksheet = XLSX.utils.aoa_to_sheet([
        ['ID', 'Nome', 'Email', 'Hospital', 'Tipo de Usuário', 'Data de Cadastro']
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuários');
    }

    // Converter worksheet para array
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Adicionar nova linha
    data.push([
      userData.id,
      userData.nome,
      userData.email,
      userData.hospital,
      userData.tipo_usuario,
      new Date().toLocaleString('pt-BR')
    ]);

    // Converter de volta para worksheet
    const newWorksheet = XLSX.utils.aoa_to_sheet(data);
    workbook.Sheets['Usuários'] = newWorksheet;

    // Salvar arquivo
    XLSX.writeFile(workbook, EXCEL_FILE_PATH);
    console.log('Planilha Excel atualizada com sucesso:', EXCEL_FILE_PATH);
  } catch (error) {
    console.error('Erro ao atualizar planilha Excel:', error);
    // Não falhar o cadastro se houver erro na planilha
  }
};


// Conectar ao banco de dados SQLite
const db = new sqlite3.Database("./questoes.db", (err) => {
  if (err) {
    console.error("Erro ao abrir o banco de dados:" + err.message);
  } else {
    console.log("Conectado ao banco de dados SQLite.");
    
    // Criar tabela de questões se não existir
    db.run(
      `CREATE TABLE IF NOT EXISTS questoes (
        id TEXT PRIMARY KEY,
        tipo TEXT,
        area TEXT,
        subtema TEXT,
        ano INTEGER,
        questao TEXT,
        alternativas TEXT,
        gabarito TEXT,
        comentario TEXT,
        imagemJustificativa TEXT,
        imagemQuestao TEXT,
        dificuldade TEXT
      )`,
      (err) => {
        if (err) {
          console.error("Erro ao criar tabela de questões:" + err.message);
        } else {
          console.log("Tabela 'questoes' criada ou já existe.");
        }
      }
  );
  }
});

// Middleware de autenticação (validação via Supabase Auth)
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: "Token de acesso requerido" });
  }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(403).json({ success: false, message: "Token inválido" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: "Erro ao validar token" });
  }
}


// Rota de teste básica (sem autenticação)
app.get("/api/test", (req, res) => {
  res.json({ message: "Servidor funcionando!", timestamp: new Date().toISOString() });
});

// Rotas de Autenticação

// Cadastro de usuário
app.post("/api/auth/register", [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
  body('nome').notEmpty().withMessage('Nome é obrigatório'),
  body('hospital').notEmpty().withMessage('Hospital é obrigatório'),
  body('tipo_usuario').isIn(['R1', 'R2', 'R3', 'R4', 'R5', 'Ortopedista']).withMessage('Tipo de usuário inválido')
], async (req, res) => {
  console.log("Recebi cadastro:", req.body);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Dados inválidos",
      errors: errors.array()
    });
  }

  const { email, password, nome, hospital, tipo_usuario } = req.body;

try {
  // 1º - Checa se email já existe na tabela "dados"
  const { data: existingUser } = await supabase
    .from('dados')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: "Email já está em uso",
      errors: [{ field: "email", message: "Email já está em uso" }]
    });
  }

  // 2º - Checa se email já existe no Supabase Auth
  const { data: userList, error: listUserErr } = await supabase.auth.admin.listUsers();
  if (listUserErr) {
    return res.status(500).json({ success: false, message: "Erro ao consultar Auth" });
  }
  const emailExists = userList?.users?.some(u => u.email === email);
  if (emailExists) {
    return res.status(400).json({
      success: false,
      message: "Email já está em uso no Auth",
      errors: [{ field: "email", message: "Email já está em uso no Auth" }]
    });
  }


  // *** INSIRA AQUI o cadastro no SUPABASE AUTH ***
const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true // ou false
});
if (authError) {
  return res.status(500).json({ success: false, message: "Erro ao registrar no Auth", error: authError });
}

// Pegue o id do usuário recém-criado pelo Auth:
const userId = authUser.user.id;

// Agora insira NA TABELA PERSONALIZADA usando esse id!
const { data, error } = await supabase
  .from('dados')
  .insert([
    {
      id: userId,      // ATENÇÃO: novo campo!
      email,
      nome,
      hospital,
      tipo_usuario
    }
  ])
  .select()
  .maybeSingle();


    if (error) {
      console.error("Erro ao criar usuário no Supabase:", error);
      return res.status(500).json({ success: false, message: "Erro ao criar usuário", error });
    }

    // Gerar token normalmente (id pode vir do data.id)
    const token = jwt.sign(
      {
        id: data.id,
        email,
        nome,
        hospital,
        tipo_usuario
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      success: true,
      message: "Usuário cadastrado com sucesso",
      data: {
        token,
        user: {
          id: data.id,
          email,
          nome,
          hospital,
          tipo_usuario
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erro interno do servidor" });
  }
});



// Login de usuário
app.post("/api/auth/login", [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Senha é obrigatória')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Dados inválidos",
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return res.status(401).json({ success: false, message: "Credenciais inválidas" });
    }

    res.json({
      success: true,
      message: "Login realizado com sucesso",
      data: {
        token: data.session.access_token,
        user: data.user
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erro interno do servidor" });
  }
});




// Obter perfil do usuário logado
app.get("/api/auth/profile", authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: {
      user: {
        id: req.user.id,
        email: req.user.email,
        nome: req.user.nome,
        hospital: req.user.hospital,
        tipo_usuario: req.user.tipo_usuario
      }
    }
  });
});

// Atualizar perfil do usuário logado
app.put("/api/auth/profile", authenticateToken, [
  body('nome').notEmpty().withMessage('Nome é obrigatório'),
  body('hospital').notEmpty().withMessage('Hospital é obrigatório'),
  body('tipo_usuario').isIn(['R1', 'R2', 'R3', 'R4', 'R5', 'Ortopedista']).withMessage('Tipo de usuário inválido')
], async (req, res) => {  // Usar async aqui para await
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Dados inválidos",
      errors: errors.array()
    });
  }

  const { nome, hospital, tipo_usuario } = req.body;

  try {
    const { data, error } = await supabase
      .from('dados')
      .update({ nome, hospital, tipo_usuario })
      .eq('id', req.user.id)
      .select()
      .maybeSingle();

    if (error) {
      return res.status(500).json({ success: false, message: "Erro ao atualizar perfil" });
    }

    res.json({
      success: true,
      message: "Perfil atualizado com sucesso",
      data: {
        user: {
          id: data.id,
          email: data.email,
          nome: data.nome,
          hospital: data.hospital,
          tipo_usuario: data.tipo_usuario
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erro interno do servidor" });
  }
});


// Rotas de Usuários (Administração)

// Listar todos os usuários
app.get("/api/users", authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('dados')
      .select('id, email, nome, hospital, tipo_usuario, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, message: "Erro ao buscar usuários", error });
    }

    res.json({
      success: true,
      data
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erro interno do servidor" });
  }
});


app.get("/api/users/export", authenticateToken, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('dados')
      .select('id, email, nome, hospital, tipo_usuario, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, message: "Erro ao buscar usuários", error });
    }

    // Criar workbook e worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(users.map(user => ({
      'ID': user.id,
      'Email': user.email,
      'Nome': user.nome,
      'Hospital': user.hospital,
      'Tipo de Usuário': user.tipo_usuario,
      'Data de Cadastro': new Date(user.created_at).toLocaleDateString('pt-BR')
    })));

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuários');

    // Gerar buffer do arquivo Excel
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Configurar headers para download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=usuarios_ortopedia_${new Date().toISOString().split('T')[0]}.xlsx`);

    res.send(excelBuffer);

  } catch (error) {
    res.status(500).json({ success: false, message: "Erro ao gerar arquivo Excel" });
  }
});

// Rotas da API de Questões (agora protegidas)

// Rota para obter o total absoluto de questões (sem filtro)
app.get('/api/totalQuestoes', (req, res) => {
  db.get('SELECT COUNT(*) as total FROM questoes', [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ totalQuestoes: row.total });
  });
});

// Buscar questões para o simulado (5 por página)
app.get('/api/simulado/questoes', authenticateToken, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 5;
  const offset = (page - 1) * limit;
  
  const { area, ano, tipo } = req.query;
  
  let query = `
    SELECT q.*, 
           GROUP_CONCAT(a.id || '|' || a.letra || '|' || a.texto, ';;;') as alternativas
    FROM questoes q
    LEFT JOIN alternativas a ON q.id = a.questao_id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (area && area !== 'todas') {
    query += ' AND q.area = ?';
    params.push(area);
  }
  
  if (ano && ano !== 'todos') {
    query += ' AND q.ano = ?';
    params.push(ano);
  }
  
  if (tipo && tipo !== 'todos') {
    query += ' AND q.tipo = ?';
    params.push(tipo);
  }
  
  query += ' GROUP BY q.id ORDER BY q.id LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar questões' });
    }
// Processar alternativas
const questoes = rows.map(row => {
  const alternativas = row.alternativas ? 
    row.alternativas.split(';;;').map(alt => {
      const [id, letra, texto] = alt.split('|');
      return { id: parseInt(id), letra, texto };
    }) : [];

  return {
    ...row,
    alternativas,
    alternativas: undefined // Remove o campo concatenado
  };
});

    // Contar total de questões para paginação
    let countQuery = 'SELECT COUNT(*) as total FROM questoes WHERE 1=1';
    const countParams = [];
    
    if (area && area !== 'todas') {
      countQuery += ' AND area = ?';
      countParams.push(area);
    }
    
    if (ano && ano !== 'todos') {
      countQuery += ' AND ano = ?';
      countParams.push(ano);
    }
    
    if (tipo && tipo !== 'todos') {
      countQuery += ' AND tipo = ?';
      countParams.push(tipo);
    }
    
    db.get(countQuery, countParams, (err, countRow) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao contar questões' });
      }
      
      const total = countRow.total;
      const totalPages = Math.ceil(total / limit);
      
      res.json({
        questoes,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    });
  });
});

// Buscar filtros disponíveis
app.get('/api/simulado/filtros', authenticateToken, (req, res) => {
  const queries = [
    'SELECT DISTINCT area FROM questoes WHERE area IS NOT NULL ORDER BY area',
    'SELECT DISTINCT ano FROM questoes WHERE ano IS NOT NULL ORDER BY ano DESC',
    'SELECT DISTINCT tipo FROM questoes WHERE tipo IS NOT NULL ORDER BY tipo'
  ];
  
  Promise.all(queries.map(query => 
    new Promise((resolve, reject) => {
      db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    })
  )).then(([areas, anos, tipos]) => {
    res.json({
      areas: areas.map(row => row.area),
      anos: anos.map(row => row.ano),
      tipos: tipos.map(row => row.tipo)
    });
  }).catch(err => {
    res.status(500).json({ error: 'Erro ao buscar filtros' });
  });
});

// Buscar referência de uma questão
app.get('/api/simulado/questoes/:id/referencia', authenticateToken, (req, res) => {
  const questaoId = req.params.id;
  
  db.get('SELECT referencia_imagem, referencia_texto FROM questoes WHERE id = ?', 
    [questaoId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar referência' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Questão não encontrada' });
    }
    
    res.json({
      imagem: row.referencia_imagem,
      texto: row.referencia_texto
    });
  });
});

// Verificar resposta
app.post('/api/simulado/questoes/:id/responder', authenticateToken, (req, res) => {
  const questaoId = req.params.id;
  const { alternativaId } = req.body;
  
  if (!alternativaId) {
    return res.status(400).json({ error: 'ID da alternativa é obrigatório' });
  }
  
  // Buscar a questão e alternativa correta
  db.get(`
    SELECT q.gabarito, q.comentario_gabarito,
           a.letra as alternativa_selecionada
    FROM questoes q
    LEFT JOIN alternativas a ON a.id = ? AND a.questao_id = q.id
    WHERE q.id = ?
  `, [alternativaId, questaoId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao verificar resposta' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Questão ou alternativa não encontrada' });
    }
    
    const correto = row.alternativa_selecionada === row.gabarito;
    
    res.json({
      correto,
      gabarito: row.gabarito,
      comentario: row.comentario_gabarito,
      alternativa_selecionada: row.alternativa_selecionada
    });
  });
});

// Buscar comentários de uma questão
app.get('/api/simulado/questoes/:id/comentarios', authenticateToken, (req, res) => {
  const questaoId = req.params.id;
  
  db.all(`
    SELECT c.*, u.nome as autor_nome
    FROM comentarios c
    JOIN users u ON c.usuario_id = u.id
    WHERE c.questao_id = ?
    ORDER BY c.created_at DESC
  `, [questaoId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar comentários' });
    }
    
    res.json(rows);
  });
});

// Adicionar comentário
app.post('/api/simulado/questoes/:id/comentarios', authenticateToken, async (req, res) => {
  const questaoId = req.params.id;
  const { texto } = req.body;
  const usuarioId = req.user.id;

  if (!texto || texto.trim().length === 0) {
    return res.status(400).json({ error: 'Texto do comentário é obrigatório' });
  }

  try {
    // Inserir no Supabase (ajuste nome da tabela e colunas conforme seu schema)
    const { data: insertedComment, error } = await supabase
      .from('comentarios')
      .insert({
        questao_id: questaoId,
        usuario_id: usuarioId,
        texto: texto.trim(),
        created_at: new Date().toISOString()
      })
      .select()
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: 'Erro ao adicionar comentário', details: error });
    }

    // Se necessário, retornar o comentário criado. Atenção: usuário pode ter que ser buscado separadamente para pegar nome.
    res.status(201).json(insertedComment);

  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});


// Deletar comentário (apenas o próprio usuário)
app.delete('/api/simulado/comentarios/:id', authenticateToken, (req, res) => {
  const comentarioId = req.params.id;
  const usuarioId = req.user.id;
  
  // Verificar se o comentário pertence ao usuário
  db.get('SELECT usuario_id FROM comentarios WHERE id = ?', [comentarioId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao verificar comentário' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Comentário não encontrado' });
    }
    
    if (row.usuario_id !== usuarioId) {
      return res.status(403).json({ error: 'Não autorizado a deletar este comentário' });
    }
    
    db.run('DELETE FROM comentarios WHERE id = ?', [comentarioId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao deletar comentário' });
      }
      
      res.json({ message: 'Comentário deletado com sucesso' });
    });
  });
});

// Fim das rotas do simulado


// Rota para obter estatísticas do histórico, migrada para Supabase-js
app.get('/api/historico/estatisticas', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { tipo, area, ano, palavraChave } = req.query;

  try {
    // Buscar histórico do usuário logado, incluindo as questões relacionadas
    let query = supabase
      .from('historico_respostas')
      .select('acertou, questoes(questao, subtema, tipo, area, ano)')
      .eq('user_id', userId);

    // Aplica os filtros dinamicamente
    if (tipo) query = query.eq('questoes.tipo', tipo);
    if (area) query = query.eq('questoes.area', area);
    if (ano) query = query.eq('questoes.ano', parseInt(ano));
    if (palavraChave) {
      // Para busca textual, é necessário filtrar localmente
      const { data: respostas, error } = await query;
      if (error) return res.status(500).json({ error: 'Erro ao buscar dados', details: error });

      // Filtro por palavra-chave (questao/subtema)
      const filtradas = respostas.filter(r =>
        (r.questoes.questao && r.questoes.questao.toLowerCase().includes(palavraChave.toLowerCase())) ||
        (r.questoes.subtema && r.questoes.subtema.toLowerCase().includes(palavraChave.toLowerCase()))
      );
      return calcularEstatisticas(filtradas, res);
    } else {
      // Sem filtro de palavra-chave, apenas execute query e calcule agregados
      const { data: respostas, error } = await query;
      if (error) return res.status(500).json({ error: 'Erro ao buscar dados', details: error });
      return calcularEstatisticas(respostas, res);
    }
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor', details: err });
  }
});

// Função auxiliar para cálculo dos agregados
function calcularEstatisticas(respostas, res) {
  const total_respostas = respostas.length;
  const total_acertos = respostas.filter(r => r.acertou === 1).length;
  const total_erros = respostas.filter(r => r.acertou === 0).length;
  const taxa_acerto = total_respostas > 0
    ? Math.round((100.0 * total_acertos / total_respostas) * 10) / 10
    : 0.0;

  res.json({
    message: "success",
    data: {
      total_respostas,
      total_acertos,
      total_erros,
      taxa_acerto
    }
  });
}


// Rota para obter todas as questões com filtros opcionais e paginação
app.get("/api/questoes", authenticateToken, (req, res) => {
  const { tipo, area, subtema, ano, palavraChave } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = 5; // Número de questões por página
  const offset = (page - 1) * limit;

  let sql = "SELECT * FROM questoes WHERE 1=1";
  let params = [];

  if (tipo) {
    sql += " AND tipo = ?";
    params.push(tipo);
  }
  if (area) {
    sql += " AND area = ?";
    params.push(area);
  }
  if (subtema) {
    sql += " AND subtema = ?";
    params.push(subtema);
  }
  if (ano) {
    sql += " AND ano = ?";
    params.push(parseInt(ano));
  }
  if (palavraChave) {
    sql += " AND (questao LIKE ? OR subtema LIKE ?)";
    params.push(`%${palavraChave}%`, `%${palavraChave}%`);
  }

  sql += " ORDER BY id LIMIT ? OFFSET ?";
  params.push(limit, offset);

  db.all(sql, params, (err, rows) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    // Processar alternativas
    const questoes = rows.map(row => ({
      ...row,
      alternativas: JSON.parse(row.alternativas)
    }));

    // Construir SQL para contar o total de questões filtradas (sem limitações)
    let countSql = "SELECT COUNT(*) as total FROM questoes WHERE 1=1";
    let countParams = [];

    if (tipo) {
      countSql += " AND tipo = ?";
      countParams.push(tipo);
    }
    if (area) {
      countSql += " AND area = ?";
      countParams.push(area);
    }
    if (subtema) {
      countSql += " AND subtema = ?";
      countParams.push(subtema);
    }
    if (ano) {
      countSql += " AND ano = ?";
      countParams.push(parseInt(ano));
    }
    if (palavraChave) {
      countSql += " AND (questao LIKE ? OR subtema LIKE ?)";
      countParams.push(`%${palavraChave}%`, `%${palavraChave}%`);
    }

// Repita os mesmos filtros do countSql aqui para statsSql
let statsSql = `
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN tipo = 'TEOT' THEN 1 ELSE 0 END) as teot,
    SUM(CASE WHEN tipo = 'TARO' THEN 1 ELSE 0 END) as taro,
    COUNT(DISTINCT area) as areas
  FROM questoes
  WHERE 1=1
`;

// Aqui, repita os mesmos IFs de filtro do countSql!
let statsParams = [];
if (tipo) {
  statsSql += " AND tipo = ?";
  statsParams.push(tipo);
}
if (area) {
  statsSql += " AND area = ?";
  statsParams.push(area);
}
if (subtema) {
  statsSql += " AND subtema = ?";
  statsParams.push(subtema);
}
if (ano) {
  statsSql += " AND ano = ?";
  statsParams.push(parseInt(ano));
}
if (palavraChave) {
  statsSql += " AND (questao LIKE ? OR subtema LIKE ?)";
  statsParams.push(`%${palavraChave}%`, `%${palavraChave}%`);
}

    db.get(countSql, countParams, (err, countRow) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }

db.get(statsSql, statsParams, (err, statsRow) => {
  if (err) {
    console.error('--- ERRO AO EXECUTAR statsSql ---');
    console.error('Erro:', err);
    console.error('Query:', statsSql);
    console.error('Params:', statsParams);
    res.status(500).json({ error: "Erro ao calcular estatísticas filtradas" });
    return;
  }

  const totalPages = Math.ceil(countRow.total / limit);

  res.json({
    message: "success",
    data: questoes,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: countRow.total,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      limit
    },
    stats: {
      total: statsRow.total,
      teot: statsRow.teot,
      taro: statsRow.taro,
      areas: statsRow.areas
    }
  });
});
      });
    });
  });



// Rota para adicionar uma nova questão
app.post("/api/questoes", authenticateToken, (req, res) => {
  const { id, tipo, area, subtema, ano, questao, alternativas, gabarito, comentario, dificuldade } = req.body;
  
  // Validação básica
  if (!id || !tipo || !area || !questao || !alternativas || !gabarito) {
    res.status(400).json({ error: "Campos obrigatórios: id, tipo, area, questao, alternativas, gabarito" });
    return;
  }
  
  // Stringify as alternativas para armazenar como texto
  const alternativasString = JSON.stringify(alternativas);

  db.run(
    `INSERT INTO questoes (id, tipo, area, subtema, ano, questao, alternativas, gabarito, comentario, dificuldade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, tipo, area, subtema, ano, questao, alternativasString, gabarito, comentario, dificuldade],
    function (err) {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.json({ message: "Questão adicionada com sucesso!", data: { id: id } });
    }
  );
});

// Rota para atualizar uma questão
app.put("/api/questoes/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { tipo, area, subtema, ano, questao, alternativas, gabarito, comentario, dificuldade } = req.body;
  
  const alternativasString = JSON.stringify(alternativas);
  
  db.run(
    `UPDATE questoes SET tipo = ?, area = ?, subtema = ?, ano = ?, questao = ?, alternativas = ?, gabarito = ?, comentario = ?, dificuldade = ? WHERE id = ?`,
    [tipo, area, subtema, ano, questao, alternativasString, gabarito, comentario, dificuldade, id],
    function (err) {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: "Questão não encontrada" });
        return;
      }
      res.json({ message: "Questão atualizada com sucesso!" });
    }
  );
});

// Rota para deletar uma questão
app.delete("/api/historico/deletar-resposta/:id", authenticateToken, async (req, res) => {
  const id = req.params.id;

  try {
    const { data, error } = await supabase
      .from('historico_respostas')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ error: error.message || error });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Resposta não encontrada" });
    }

    res.json({ message: "Resposta deletada com sucesso!" });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor', details: err.message });
  }
});


// Rota para obter estatísticas
app.get("/api/estatisticas", authenticateToken, (req, res) => {
  const queries = [
    "SELECT COUNT(*) as total FROM questoes",
    "SELECT COUNT(*) as teot FROM questoes WHERE tipo = 'TEOT'",
    "SELECT COUNT(*) as taro FROM questoes WHERE tipo = 'TARO'",
    "SELECT COUNT(DISTINCT area) as areas FROM questoes"
  ];
  
  Promise.all(queries.map(query => 
    new Promise((resolve, reject) => {
      db.get(query, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    })
  )).then(results => {
    res.json({
      message: "success",
      data: {
        total: results[0].total,
        teot: results[1].teot,
        taro: results[2].taro,
        areas: results[3].areas
      }
    });
  }).catch(err => {
    res.status(400).json({ error: err.message });
  });
});

// Buscar histórico de respostas do usuário logado
app.get('/api/historico', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { tipo, area, ano, palavraChave } = req.query;

  try {
    // Buscar respostas com dados da questão
    const { data: respostas, error } = await supabase
      .from('historico_respostas')
      .select('*, questoes(*)')
      .eq('user_id', userId);

    if (error) return res.status(500).json({ error: 'Erro ao buscar histórico', details: error });

    // Filtrar últimas respostas por questao_id
    const ultimasRespostasMap = new Map();
    for (const r of respostas) {
      const prev = ultimasRespostasMap.get(r.questao_id);
      if (!prev || new Date(r.data_resposta) > new Date(prev.data_resposta)) {
        ultimasRespostasMap.set(r.questao_id, r);
      }
    }
    let ultimasRespostas = Array.from(ultimasRespostasMap.values());

    // Aplicar filtros
    if (tipo) {
      ultimasRespostas = ultimasRespostas.filter(r => r.questoes.tipo === tipo);
    }
    if (area) {
      ultimasRespostas = ultimasRespostas.filter(r => r.questoes.area === area);
    }
    if (ano) {
      ultimasRespostas = ultimasRespostas.filter(r => r.questoes.ano === parseInt(ano));
    }
    if (palavraChave) {
      const keyword = palavraChave.toLowerCase();
      ultimasRespostas = ultimasRespostas.filter(r => 
        (r.questoes.questao && r.questoes.questao.toLowerCase().includes(keyword)) ||
        (r.questoes.subtema && r.questoes.subtema.toLowerCase().includes(keyword))
      );
    }

    // Ordenar por data_resposta decrescente
    ultimasRespostas.sort((a, b) => new Date(b.data_resposta) - new Date(a.data_resposta));

    res.json({ data: ultimasRespostas });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor', details: err.message });
  }
});


// Salvar uma nova resposta no histórico
app.post('/api/historico/salvar-resposta', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { questao_id, resposta_usuario, resposta_correta, acertou } = req.body;

  if (!questao_id || resposta_usuario == null || resposta_correta == null || acertou == null) {
    return res.status(400).json({ error: 'Dados incompletos para salvar resposta' });
  }

  try {
    // Deletar resposta anterior para a questão do usuário
    const { error: deleteError } = await supabase
      .from('historico_respostas')
      .delete()
      .eq('user_id', userId)
      .eq('questao_id', questao_id);

    if (deleteError) {
      return res.status(500).json({ error: 'Erro ao deletar resposta anterior', details: deleteError });
    }

    // Inserir nova resposta
    const { data, error: insertError } = await supabase
      .from('historico_respostas')
      .insert({
        user_id: userId,
        questao_id,
        resposta_usuario,
        resposta_correta,
        acertou,
        data_resposta: new Date().toISOString()
      })
      .select()
      .maybeSingle();

    if (insertError) {
      return res.status(500).json({ error: 'Erro ao salvar resposta', details: insertError });
    }

    res.json({ message: 'Resposta salva com sucesso', id: data.id });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor', details: err.message });
  }
});

// Rota para estatísticas do histórico do usuário logado (Supabase-js)
app.get('/api/historico/estatisticas', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    // Buscar todas as respostas do usuário
    const { data: respostas, error } = await supabase
      .from('historico_respostas')
      .select('acertou')
      .eq('user_id', userId);

    if (error) {
      return res.status(500).json({ error: 'Erro ao buscar estatísticas', details: error });
    }

    // Calcular estatísticas agregadas manualmente
    const total_respostas = respostas.length;
    const total_acertos = respostas.filter(r => r.acertou === 1).length;
    const total_erros = respostas.filter(r => r.acertou === 0).length;
    const taxa_acerto = total_respostas > 0
      ? Math.round((100.0 * total_acertos / total_respostas) * 10) / 10
      : 0.0;

    res.json({
      message: "success",
      data: {
        total_respostas,
        total_acertos,
        total_erros,
        taxa_acerto
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar estatísticas', details: err });
  }
});

// Iniciar o servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Arquivo .env carregado com JWT_SECRET configurado`);
});