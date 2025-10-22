import express from "express";
import mongoose from "mongoose";
import Frequencia from "./Frequencia.js";
import cors from "cors";
import User from "./user.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import Config from './config.js';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" })); 
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://facialpoint-site-production.up.railway.app');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');

    // Responder ao preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
});

// Configure o CORS após os headers acima
app.use(cors({
    origin: 'https://facialpoint-site-production.up.railway.app',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
}));

const SECRET = "seuSegredoSuperSeguro"; 

const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://mongo:zIpKJZQSviaVIPgvjcddjhCiJuiWudXP@switchyard.proxy.rlwy.net:43714');
        console.log("Conectado ao MongoDB");
    } catch (error) {
        console.log("Erro ao conectar ao MongoDB", error);
    }
};

connectDB();

const autenticarToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ erro: "Acesso negado! Token não fornecido." });
    }

    try {
        const usuarioVerificado = jwt.verify(token, SECRET);
        req.usuario = usuarioVerificado; 
        next();
    } catch (error) {
        res.status(403).json({ erro: "Token inválido ou expirado!" });
    }
};

const verifyToken = (req, res, next) => {
  const bearerHeader = req.headers['authorization'];
  
  if (!bearerHeader) {
    return res.status(401).json({ error: 'Acesso não autorizado. Token não fornecido.' });
  }
  
  try {
    const bearer = bearerHeader.split(' ');
    const token = bearer[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Erro ao verificar token:', error.message);
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};

function preencherHorarioTrabalho(horarioTrabalho) {
    const dias = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
    const preenchido = {};
    for (const dia of dias) {
        preenchido[dia] = {
            entrada: horarioTrabalho?.[dia]?.entrada ?? null,
            saida:   horarioTrabalho?.[dia]?.saida   ?? null
        };
    }
    return preenchido;
}

function validarHorarioTrabalho(horarioTrabalho) {
    if (!horarioTrabalho) return false;
    return Object.values(horarioTrabalho).some(
        dia => dia && dia.entrada && dia.saida
    );
}

app.post("/usuarios/cadastro", async (req, res) => {
    try {
        const { nome, email, senha, foto, perfil, horarioTrabalho, role } = req.body;

        if (!nome || !email || !senha || !foto || !perfil) {
            return res.status(400).json({ erro: "Todos os campos são obrigatórios!" });
        }

        if (role !== "administrador" && !validarHorarioTrabalho(horarioTrabalho)) {
            return res.status(400).json({ erro: "Pelo menos um dia da semana deve ter horário de entrada e saída preenchido!" });
        }

        const horarioTrabalhoFinal = (role !== "administrador")
            ? preencherHorarioTrabalho(horarioTrabalho)
            : undefined;

        const usuarioExistente = await User.findOne({ email });
        if (usuarioExistente) {
            return res.status(400).json({ erro: "Já existe uma conta com este email!" });
        }

        const senhaCriptografada = await bcrypt.hash(senha, 10);

        const novoUsuario = await User.create({
            nome,
            email,
            senha: senhaCriptografada,
            foto,
            perfil,
            role: role || "funcionario",
            horarioTrabalho: horarioTrabalhoFinal
        });

        res.status(201).json(novoUsuario);
    } catch (error) {
        console.error("Erro ao cadastrar usuário:", error);
        res.status(500).json({ erro: "Erro ao cadastrar usuário", detalhes: error.message });
    }
});

app.post("/usuarios/login", async (req, res) => {
    try {
        const { email, senha } = req.body;

        const usuario = await User.findOne({ email });
        if (!usuario) {
            return res.status(400).json({ erro: "Usuário não encontrado!" });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(401).json({ erro: "Senha incorreta!" });
        }

        const token = jwt.sign(
            { _id: usuario._id, email: usuario.email, role: usuario.role },
            SECRET,
            { expiresIn: "1h" }
        );

        if (usuario.role === "administrador") {
            res.json({
                mensagem: "Login realizado com sucesso!",
                token,
                rota: "/admin/dashboard" 
            });
        } else {
            res.json({
                mensagem: "Login realizado com sucesso!",
                token,
                rota: "/funcionario/dashboard" 
            });
        }
    } catch (error) {
        res.status(500).json({ erro: "Erro ao fazer login", detalhes: error });
    }
});

app.get("/usuarios/me", autenticarToken, async (req, res) => {
    try {
        const usuario = await User.findById(req.usuario._id).populate("frequencia");
        res.json(usuario);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao buscar usuário", detalhes: error });
    }
});

app.post("/usuarios/me/frequencia", autenticarToken, async (req, res) => {
    try {
        const agora = new Date();

        const novaFrequencia = await Frequencia.create({
            nome: req.body.nome, 
            horario: agora, 
            data: agora, 
            usuario: req.usuario._id
        });

        const usuarioAtualizado = await User.findByIdAndUpdate(
            req.usuario._id,
            { $push: { frequencia: novaFrequencia._id } },
            { new: true }
        );

        res.json(usuarioAtualizado);
    } catch (error) {
        console.error("Erro ao registrar frequência:", error);
        res.status(500).json({ erro: "Erro ao registrar frequência", detalhes: error });
    }
});

app.get("/frequencias/minhas", autenticarToken, async (req, res) => {
    try {
        console.log(`Buscando frequências para usuário: ${req.usuario._id}`);
        
        const frequencias = await Frequencia.find({ 
            usuario_id: req.usuario._id 
        }).sort({ data: -1 });
        
        console.log(`Encontradas ${frequencias.length} frequências para usuário ${req.usuario._id}`);
        
        res.json(frequencias);
    } catch (error) {
        console.error("Erro ao buscar frequências:", error);
        res.status(500).json({ erro: "Erro ao buscar frequências", detalhes: error.message });
    }
});

app.put("/usuarios/me", autenticarToken, async (req, res) => {
    try {
        if (req.usuario.role !== "administrador" && !validarHorarioTrabalho(req.body.horarioTrabalho)) {
            return res.status(400).json({ erro: "Pelo menos um dia da semana deve ter horário de entrada e saída preenchido!" });
        }
        if (req.usuario.role !== "administrador") {
            req.body.horarioTrabalho = preencherHorarioTrabalho(req.body.horarioTrabalho);
        }
        const usuarioAtualizado = await User.findByIdAndUpdate(req.usuario._id, req.body, { new: true });
        res.json(usuarioAtualizado);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao atualizar usuário", detalhes: error });
    }
});

app.delete("/usuarios/me", autenticarToken, async (req, res) => {
    try {
        const usuarioExcluido = await User.findByIdAndDelete(req.usuario._id);
        res.json(usuarioExcluido);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao excluir usuário", detalhes: error });
    }
});

app.get("/usuarios/:_id", autenticarToken, async (req, res) => {
    try {
        const usuario = await User.findById(req.params._id).populate("frequencia");
        if (!usuario) {
            return res.status(404).json({ erro: "Usuário não encontrado!" });
        }
        res.json(usuario);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao buscar usuário por ID", detalhes: error });
    }
});

app.get("/proxy/horario-brasilia", async (req, res) => {
    try {
        const response = await fetch("https://timeapi.io/api/Time/current/zone?timeZone=America/Sao_Paulo");
        if (!response.ok) {
            return res.status(500).json({ error: "Erro ao consultar TimeAPI.io" });
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Erro ao obter horário de Brasília", detalhes: error.message });
    }
});

app.post('/auth/kiosk', (req, res) => {
  const { kioskSecret } = req.body;
  
  if (kioskSecret === "FacialPoint2025") {
    const kioskToken = jwt.sign(
      { type: 'kiosk', permissions: ['read_users'] },
      "sua_chave_secreta_jwt_aqui", 
      { expiresIn: '24h' }
    );
    
    return res.json({ token: kioskToken });
  }
  
  return res.status(401).json({ error: 'Autenticação do quiosque inválida' });
});

app.get('/public/usuarios/codificacoes', async (req, res) => {
  try {
    const usuarios = await User.find({}, { _id: 1, nome: 1, foto: 1 });
    
    res.status(200).json(usuarios.map(usuario => ({
      id: usuario._id,
      nome: usuario.nome,
      foto: usuario.foto
    })));
  } catch (error) {
    console.error('Erro ao buscar codificações faciais:', error);
    res.status(500).json({ erro: 'Erro ao buscar codificações faciais' });
  }
});

app.get('/frequencias/verifica/:usuarioId', async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const data = req.query.data; 
    const tipo = req.query.tipo; 
    
    const dataInicio = new Date(`${data}T00:00:00-03:00`);
    const dataFim = new Date(`${data}T23:59:59-03:00`);
    
    const filtro = {
      usuario_id: usuarioId,
      data: { $gte: dataInicio, $lt: dataFim }
    };
    
    if (tipo) {
      filtro.tipo_registro = tipo;
    }
    
    const registros = await Frequencia.find(filtro);
    
    res.status(200).json({ 
      jaRegistrou: registros.length > 0,
      registros: registros
    });
  } catch (error) {
    console.error('Erro ao verificar registro:', error);
    res.status(500).json({ erro: 'Erro ao verificar registro: ' + error.message });
  }
});

app.post('/frequencias/registrar', async (req, res) => {
  try {
    const { nome, usuario_id, data, tipo_registro } = req.body;
    
    const novaFrequencia = new Frequencia({
      nome,
      usuario_id,
      data: new Date(data),  
      tipo_registro: tipo_registro || 'entrada'
    });
    
    const dataOriginal = new Date(data);
    
    const localDateString = dataOriginal.toLocaleString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const [dia, mes, ano] = localDateString.split('/');
    const dataLocalFormatada = `${ano}-${mes}-${dia}`;
    
    const inicioDiaLocal = new Date(`${dataLocalFormatada}T00:00:00-03:00`);
    const fimDiaLocal = new Date(`${dataLocalFormatada}T23:59:59.999-03:00`);
    
    const registroExistente = await Frequencia.findOne({
      usuario_id,
      tipo_registro,
      data: { 
        $gte: inicioDiaLocal,
        $lt: fimDiaLocal
      }
    });
    
    if (registroExistente) {
      return res.status(409).json({ 
        erro: `Você já registrou seu ponto de ${tipo_registro === 'entrada' ? 'entrada' : 'saída'} hoje.`,
        frequencia: registroExistente
      });
    }
    
    if (tipo_registro === 'saida') {
      const temEntrada = await Frequencia.findOne({
        usuario_id,
        tipo_registro: 'entrada',
        data: { 
          $gte: inicioDiaLocal, 
          $lt: fimDiaLocal 
        }
      });
      
      if (!temEntrada) {
        return res.status(400).json({ 
          erro: 'Você precisa registrar o ponto de entrada antes do ponto de saída'
        });
      }
    }
    
    await novaFrequencia.save();
    
    res.status(201).json({ 
      mensagem: 'Registro de ponto realizado com sucesso',
      frequencia: novaFrequencia,
      dataOriginal: data,
      dataArmazenada: novaFrequencia.data.toISOString(),
      dataLocalFormatada: novaFrequencia.data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    });
  } catch (error) {
    console.error('Erro ao registrar ponto:', error);
    res.status(500).json({ erro: 'Erro ao registrar ponto: ' + error.message });
  }
});

app.get("/usuarios/ids", autenticarToken, async (req, res) => {
    try {
        const usuarios = await User.find({ role: { $ne: "administrador" } }, { _id: 1 });
        const ids = usuarios.map(u => u._id);
        res.json(ids);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao buscar IDs dos usuários", detalhes: error.message });
    }
});

app.get("/usuarios/:_id/horario", async (req, res) => {
  try {
    const usuario = await User.findById(req.params._id, { horarioTrabalho: 1 });
    if (!usuario) {
      return res.status(404).json({ erro: "Usuário não encontrado!" });
    }
    res.json(usuario.horarioTrabalho);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar horário de trabalho", detalhes: error.message });
  }
});

app.get("/public/usuarios/:_id/horario", async (req, res) => {
  try {
    const usuario = await User.findById(req.params._id, { horarioTrabalho: 1 });
    if (!usuario) {
      return res.status(404).json({ erro: "Usuário não encontrado!" });
    }
    res.json(usuario.horarioTrabalho);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar horário de trabalho", detalhes: error.message });
  }
});

app.get("/usuarios/todos", async (req, res) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        
        if (!token) {
            return res.status(401).json({ erro: "Acesso negado! Token não fornecido." });
        }
        
        try {
            const usuarioVerificado = jwt.verify(token, SECRET);
            
            const usuarios = await User.find(
                { role: { $ne: "administrador" } }, 
                { senha: 0, foto: 0 } 
            );
            
            return res.json(usuarios);
        } catch (tokenError) {
            console.error("Erro na verificação do token:", tokenError);
            return res.status(403).json({ 
                erro: "Token inválido ou expirado!", 
                detalhes: tokenError.message 
            });
        }
    } catch (error) {
        console.error("Erro ao buscar usuários:", error);
        return res.status(500).json({ 
            erro: "Erro ao buscar usuários", 
            detalhes: error.message 
        });
    }
});

app.get('/public/usuarios/completos', async (req, res) => {
  try {
    const usuarios = await User.find(
      { role: { $ne: "administrador" } }, 
      { 
        _id: 1, 
        nome: 1, 
        foto: 1, 
        perfil: 1
      }
    );
    
    res.status(200).json(usuarios.map(usuario => ({
      id: usuario._id,
      nome: usuario.nome,
      foto: usuario.foto,
      perfil: usuario.perfil
    })));
  } catch (error) {
    console.error('Erro ao buscar dados dos usuários:', error);
    res.status(500).json({ erro: 'Erro ao buscar dados dos usuários' });
  }
});

app.get('/frequencias/usuario/:id', autenticarToken, async (req, res) => {
  try {
    if (req.usuario.role !== 'administrador') {
      return res.status(403).json({ erro: 'Acesso negado. Apenas administradores podem acessar este recurso.' });
    }
    
    const { id } = req.params;
    
    const frequencias = await Frequencia.find({ usuario_id: id })
      .sort({ data: -1 });
    
    res.json(frequencias);
  } catch (error) {
    console.error('Erro ao buscar frequências do usuário:', error);
    res.status(500).json({ 
      erro: 'Erro ao buscar frequências do usuário', 
      detalhes: error.message 
    });
  }
});

app.put('/usuarios/admin/:id', autenticarToken, async (req, res) => {
  try {
    if (req.usuario.role !== 'administrador') {
      return res.status(403).json({ erro: 'Acesso negado. Apenas administradores podem atualizar dados de outros usuários.' });
    }
    
    const { id } = req.params;
    const { nome, email, horarioTrabalho, senha, foto, perfil } = req.body;
    
    if (horarioTrabalho && !validarHorarioTrabalho(horarioTrabalho)) {
      return res.status(400).json({ erro: "Pelo menos um dia da semana deve ter horário de entrada e saída preenchido!" });
    }
    
    const usuarioExistente = await User.findById(id);
    if (!usuarioExistente) {
      return res.status(404).json({ erro: "Usuário não encontrado!" });
    }
    
    const dadosAtualizacao = {};
    if (nome) dadosAtualizacao.nome = nome;
    if (email) dadosAtualizacao.email = email;
    
    if (senha) {
      dadosAtualizacao.senha = await bcrypt.hash(senha, 10);
    }
    
    if (foto) {
      dadosAtualizacao.foto = foto;
    }
    
    if (perfil) {
      dadosAtualizacao.perfil = perfil;
    }
    
    if (horarioTrabalho) {
      dadosAtualizacao.horarioTrabalho = preencherHorarioTrabalho(horarioTrabalho);
    }
    
    const usuarioAtualizado = await User.findByIdAndUpdate(
      id,
      dadosAtualizacao,
      { new: true, runValidators: true }
    );
    
    const resposta = usuarioAtualizado.toObject();
    delete resposta.senha;
    
    res.json(resposta);
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ 
      erro: 'Erro ao atualizar dados do usuário', 
      detalhes: error.message 
    });
  }
});

app.delete('/usuarios/admin/:id', autenticarToken, async (req, res) => {
  try {
    if (req.usuario.role !== 'administrador') {
      return res.status(403).json({ erro: 'Acesso negado. Apenas administradores podem excluir outros usuários.' });
    }
    
    const { id } = req.params;
    
    const usuarioExistente = await User.findById(id);
    if (!usuarioExistente) {
      return res.status(404).json({ erro: "Usuário não encontrado!" });
    }
    
    if (usuarioExistente.role === 'administrador') {
      return res.status(403).json({ erro: "Não é possível excluir uma conta de administrador!" });
    }
    
    await Frequencia.deleteMany({ usuario_id: id });
    
    const usuarioExcluido = await User.findByIdAndDelete(id);
    
    if (!usuarioExcluido) {
      return res.status(404).json({ erro: 'Usuário não encontrado ou já foi removido.' });
    }
    
    res.json({ 
      mensagem: 'Usuário excluído com sucesso', 
      usuario: usuarioExcluido 
    });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({ 
      erro: 'Erro ao excluir usuário', 
      detalhes: error.message 
    });
  }
});

app.post('/config/verificar-senha-kiosk', async (req, res) => {
  try {
    const { senha } = req.body;
    
    if (!senha) {
      return res.status(400).json({ erro: 'Senha não fornecida' });
    }
    
    const configSenha = await Config.findOne({ chave: 'senha_kiosk' });
    
    if (!configSenha) {
      return res.status(404).json({ erro: 'Configuração de senha do quiosque não encontrada' });
    }
    
    if (senha === configSenha.valor) {
      return res.status(200).json({ sucesso: true });
    } else {
      return res.status(401).json({ erro: 'Senha incorreta' });
    }
  } catch (error) {
    console.error('Erro ao verificar senha do quiosque:', error);
    return res.status(500).json({ erro: 'Erro ao verificar senha' });
  }
});

app.post('/config/atualizar-senha-kiosk', autenticarToken, async (req, res) => {
  try {
    if (req.usuario.role !== 'administrador') {
      return res.status(403).json({ erro: 'Acesso negado. Apenas administradores podem atualizar esta configuração.' });
    }
    
    const { senha } = req.body;
    
    if (!senha || senha.trim().length < 4) {
      return res.status(400).json({ erro: 'A senha deve ter pelo menos 4 caracteres' });
    }
    
    const configExistente = await Config.findOne({ chave: 'senha_kiosk' });
    
    if (configExistente) {
      configExistente.valor = senha;
      await configExistente.save();
    } else {
      await Config.create({
        chave: 'senha_kiosk',
        valor: senha,
        descricao: 'Senha para acesso ao quiosque de registro de ponto'
      });
    }
    
    return res.status(200).json({ sucesso: true, mensagem: 'Senha do quiosque atualizada com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar senha do quiosque:', error);
    return res.status(500).json({ erro: 'Erro ao atualizar senha do quiosque' });
  }
});

app.get('/config/senha-kiosk', autenticarToken, async (req, res) => {
  try {
    if (req.usuario.role !== 'administrador') {
      return res.status(403).json({ erro: 'Acesso negado. Apenas administradores podem acessar esta configuração.' });
    }
    
    const configSenha = await Config.findOne({ chave: 'senha_kiosk' });
    
    if (!configSenha) {
      return res.status(404).json({ erro: 'Configuração de senha do quiosque não encontrada' });
    }
    
    return res.status(200).json({ 
      senha: configSenha.valor,
      dataCriacao: configSenha.dataCriacao,
      dataAtualizacao: configSenha.dataAtualizacao
    });
  } catch (error) {
    console.error('Erro ao buscar senha do quiosque:', error);
    return res.status(500).json({ erro: 'Erro ao buscar senha do quiosque' });
  }
});

app.post('/frequencias/manual', autenticarToken, async (req, res) => {
  try {
    if (req.usuario.role !== 'administrador') {
      return res.status(403).json({ erro: 'Apenas administradores podem adicionar ponto manualmente.' });
    }
    const { usuario_id, nome, data, tipo_registro } = req.body;
    if (!usuario_id || !nome || !data || !tipo_registro) {
      return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios.' });
    }
    const dataObj = new Date(data);
    if (isNaN(dataObj.getTime())) {
      return res.status(400).json({ erro: 'Data ou hora inválida.' });
    }
    const dataLocal = new Date(dataObj.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const inicioDia = new Date(dataLocal);
    inicioDia.setHours(0,0,0,0);
    const fimDia = new Date(dataLocal);
    fimDia.setHours(23,59,59,999);
    const jaExiste = await Frequencia.findOne({
      usuario_id,
      tipo_registro,
      data: { $gte: inicioDia, $lte: fimDia }
    });
    if (jaExiste) {
      return res.status(409).json({ erro: `Já existe um registro de ${tipo_registro} para este dia.` });
    }
    if (tipo_registro === 'saida') {
      const temEntrada = await Frequencia.findOne({
        usuario_id,
        tipo_registro: 'entrada',
        data: { $gte: inicioDia, $lte: fimDia }
      });
      if (!temEntrada) {
        return res.status(400).json({ erro: 'É necessário ter um registro de entrada antes de adicionar uma saída.' });
      }
    }
    const novaFrequencia = new Frequencia({
      nome,
      usuario_id,
      data: dataObj,
      tipo_registro
    });
    await novaFrequencia.save();
    res.status(201).json({ mensagem: 'Ponto manual adicionado com sucesso', frequencia: novaFrequencia });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao adicionar ponto manual', detalhes: error.message });
  }
});

app.get('/frequencias/usuario/:id/csv', autenticarToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica se o usuário está tentando acessar seus próprios dados ou é admin
    if (req.usuario._id !== id && req.usuario.role !== 'administrador') {
      return res.status(403).json({ 
        erro: 'Acesso negado. Você só pode exportar suas próprias frequências.' 
      });
    }

    const usuario = await User.findById(id);
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    const frequencias = await Frequencia.find({ usuario_id: id })
      .sort({ data: 1 });

    if (frequencias.length === 0) {
      return res.status(404).json({ erro: 'Nenhum registro de frequência encontrado' });
    }

    // Criar cabeçalho do CSV
    let csv = 'Data,Hora,Tipo de Registro,Nome\n';

    // Adicionar linhas de dados
    frequencias.forEach(freq => {
      const data = new Date(freq.data);
      const dataFormatada = data.toLocaleDateString('pt-BR');
      const horaFormatada = data.toLocaleTimeString('pt-BR');
      
      csv += `${dataFormatada},${horaFormatada},${freq.tipo_registro},${freq.nome}\n`;
    });

    // Configurar headers para download do arquivo
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=frequencias_${usuario.nome}_${new Date().toISOString().split('T')[0]}.csv`);

    res.send(csv);

  } catch (error) {
    console.error('Erro ao gerar CSV de frequências:', error);
    res.status(500).json({ 
      erro: 'Erro ao gerar arquivo CSV', 
      detalhes: error.message 
    });
  }
});

app.listen(PORT, () => console.log(`O servidor está rodando na porta ${PORT}`));
