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

    // Criar tabela de usuários se não existir
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nome TEXT NOT NULL,
        hospital TEXT NOT NULL,
        tipo_usuario TEXT NOT NULL CHECK (tipo_usuario IN ('R1', 'R2', 'R3', 'R4', 'R5', 'Ortopedista')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => {
        if (err) {
          console.error("Erro ao criar tabela de usuários:" + err.message);
        } else {
          console.log("Tabela 'users' criada ou já existe.");
        }
      }
    );
  }
});

// Middleware de autenticação
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ success: false, message: "Token de acesso requerido" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: "Token inválido" });
    }
    req.user = user;
    next();
  });
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
    // Checar se o email já existe no Supabase
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

    // Gerar hash da senha
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Inserir no Supabase
    const { data, error } = await supabase
      .from('dados')
      .insert([
        {
          email,
          password: password_hash,
          nome,
          hospital,
          tipo_usuario
        }
      ])
      .select()
      .maybeSingle();

    if (error) {
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
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
      if (err) {
        return res.status(500).json({ success: false, message: "Erro interno do servidor" });
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Credenciais inválidas"
        });
      }

      // Verificar senha
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: "Credenciais inválidas"
        });
      }

      // Gerar token JWT
      const token = jwt.sign(
        { id: user.id, email: user.email, nome: user.nome, hospital: user.hospital, tipo_usuario: user.tipo_usuario },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      res.json({
        success: true,
        message: "Login realizado com sucesso",
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            nome: user.nome,
            hospital: user.hospital,
            tipo_usuario: user.tipo_usuario
          }
        }
      });
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
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Dados inválidos",
      errors: errors.array()
    });
  }

  const { nome, hospital, tipo_usuario } = req.body;

  db.run(
    `UPDATE users SET nome = ?, hospital = ?, tipo_usuario = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [nome, hospital, tipo_usuario, req.user.id],
    function (err) {
      if (err) {
        return res.status(500).json({ success: false, message: "Erro ao atualizar perfil" });
      }

      res.json({
        success: true,
        message: "Perfil atualizado com sucesso",
        data: {
          user: {
            id: req.user.id,
            email: req.user.email,
            nome,
            hospital,
            tipo_usuario
          }
        }
      });
    }
  );
});

// Rotas de Usuários (Administração)

// Listar todos os usuários
app.get("/api/users", authenticateToken, (req, res) => {
  db.all("SELECT id, email, nome, hospital, tipo_usuario, created_at FROM users ORDER BY created_at DESC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: "Erro ao buscar usuários" });
    }

    res.json({
      success: true,
      data: rows
    });
  });
});

// Exportar usuários para Excel
app.get("/api/users/export", authenticateToken, (req, res) => {
  db.all("SELECT id, email, nome, hospital, tipo_usuario, created_at FROM users ORDER BY created_at DESC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: "Erro ao buscar usuários" });
    }

    try {
      // Criar workbook e worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows.map(row => ({
        'ID': row.id,
        'Email': row.email,
        'Nome': row.nome,
        'Hospital': row.hospital,
        'Tipo de Usuário': row.tipo_usuario,
        'Data de Cadastro': new Date(row.created_at).toLocaleDateString('pt-BR')
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
app.post('/api/simulado/questoes/:id/comentarios', authenticateToken, (req, res) => {
  const questaoId = req.params.id;
  const { texto } = req.body;
  const usuarioId = req.user.id;
  
  if (!texto || texto.trim().length === 0) {
    return res.status(400).json({ error: 'Texto do comentário é obrigatório' });
  }
  
  db.run(`
    INSERT INTO comentarios (questao_id, usuario_id, texto, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `, [questaoId, usuarioId, texto.trim()], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Erro ao adicionar comentário' });
    }
    
    // Buscar o comentário criado com o nome do autor
    db.get(`
      SELECT c.*, u.nome as autor_nome
      FROM comentarios c
      JOIN users u ON c.usuario_id = u.id
      WHERE c.id = ?
    `, [this.lastID], (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao buscar comentário criado' });
      }
      
      res.status(201).json(row);
    });
  });
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


// Rota para obter o total absoluto de questões (sem filtro)
app.get('/api/historico/estatisticas', authenticateToken, (req, res) => {
const userId = req.user.id;
const { tipo, area, ano, palavraChave } = req.query;

let where = 'hr.user_id = ?';
let params = [userId];

if (tipo) {
  where += ' AND q.tipo = ?';
  params.push(tipo);
}
if (area) {
  where += ' AND q.area = ?';
  params.push(area);
}
if (ano) {
  where += ' AND q.ano = ?';
  params.push(parseInt(ano)); // se for string, converte para número
}
if (palavraChave) {
  where += ' AND (q.questao LIKE ? OR q.subtema LIKE ?)';
  params.push(`%${palavraChave}%`, `%${palavraChave}%`);
}

const sql = `
  SELECT
    COUNT(*) as total_respostas,
    SUM(hr.acertou) as total_acertos,
    SUM(CASE WHEN hr.acertou = 0 THEN 1 ELSE 0 END) as total_erros,
    ROUND(100.0 * SUM(hr.acertou) / COUNT(*), 1) as taxa_acerto
  FROM historico_respostas hr
  LEFT JOIN questoes q ON hr.questao_id = q.id
  WHERE ${where}
`;

db.get(sql, params, (err, row) => {
  if (err) {
    console.error('Erro ao executar estatísticas:', err);
    return res.status(500).json({ error: "Erro ao buscar total de questões" });
  }
  row.taxa_acerto = row.taxa_acerto || 0.0;
  res.json({
    message: "success",
    data: row
  });
});

});

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
app.delete("/api/historico/deletar-resposta/:id", authenticateToken, (req, res) => {
  const id = req.params.id;
  db.run(
    "DELETE FROM historico_respostas WHERE id = ?",
    [id],
    function(err) {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: "Resposta não encontrada" });
        return;
      }
      res.json({ message: "Resposta deletada com sucesso!" });
    }
  );
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
app.get('/api/historico', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { tipo, area, ano, palavraChave } = req.query;

  let sql = `
    SELECT hr.*, q.questao, q.id AS questao_id, q.tipo, q.area, q.ano
    FROM historico_respostas hr
    JOIN (
      SELECT questao_id, MAX(data_resposta) AS max_data
      FROM historico_respostas
      WHERE user_id = ?
      GROUP BY questao_id
    ) ultimas ON hr.questao_id = ultimas.questao_id AND hr.data_resposta = ultimas.max_data
    LEFT JOIN questoes q ON hr.questao_id = q.id
    WHERE hr.user_id = ?
  `;
  let params = [userId, userId];

  if (tipo) {
    sql += ' AND q.tipo = ?';
    params.push(tipo);
  }
  if (area) {
    sql += ' AND q.area = ?';
    params.push(area);
  }
  if (ano) {
    sql += ' AND q.ano = ?';
    params.push(parseInt(ano));
  }
  if (palavraChave) {
    sql += ' AND (q.questao LIKE ? OR q.subtema LIKE ?)';
    params.push(`%${palavraChave}%`, `%${palavraChave}%`);
  }
  sql += ' ORDER BY hr.data_resposta DESC';

  db.all(sql, params, (err, rows) => {
    if (err)
      return res.status(500).json({ error: 'Erro ao buscar histórico' });
    res.json({ data: rows });
  });
});

// Salvar uma nova resposta no histórico
app.post('/api/historico/salvar-resposta', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { questao_id, resposta_usuario, resposta_correta, acertou } = req.body;

  if (!questao_id || resposta_usuario == null || resposta_correta == null || acertou == null) {
    return res.status(400).json({ error: 'Dados incompletos para salvar resposta' });
  }

db.run(`DELETE FROM historico_respostas WHERE user_id = ? AND questao_id = ?`, [userId, questao_id], (err) => {
  if (err) return res.status(500).json({ error: 'Erro ao deletar resposta anterior' });
  db.run(`INSERT INTO historico_respostas (user_id, questao_id, resposta_usuario, resposta_correta, acertou, data_resposta)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [userId, questao_id, resposta_usuario, resposta_correta, acertou],
    function (err) {
      if (err) return res.status(500).json({ error: 'Erro ao salvar resposta' });
      res.json({ message: 'Resposta salva com sucesso', id: this.lastID });
    }
  );
});
});

// Rota para estatísticas do histórico do usuário logado
app.get('/api/historico/estatisticas', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.get(
    `SELECT
      COUNT(*) as total_respostas,
      SUM(acertou) as total_acertos,
      SUM(CASE WHEN acertou = 0 THEN 1 ELSE 0 END) as total_erros,
      ROUND(100.0 * SUM(acertou) / COUNT(*), 1) as taxa_acerto
    FROM historico_respostas
    WHERE user_id = ?`,
    [userId],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao buscar estatísticas' });
      }
      // Garantir que não retorne null para taxa_acerto
      row.taxa_acerto = row.taxa_acerto || 0.0;
      res.json({
        message: "success",
        data: row
      });
    }
  );
});

// Iniciar o servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Arquivo .env carregado com JWT_SECRET configurado`);
});