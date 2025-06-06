import express from "express";
import mongoose from "mongoose";
import Frequencia from "./Frequencia.js";
import cors from "cors";
import User from "./user.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const app = express();
const PORT = 3000;

// Aumenta o limite de tamanho das requisições JSON e URL-encoded
app.use(express.json({ limit: "10mb" })); // Aumenta o limite para 10MB
app.use(express.urlencoded({ limit: "10mb", extended: true })); // Para requisições URL-encoded

app.use(cors({ origin: "*" }));

const SECRET = "seuSegredoSuperSeguro"; // Use variável de ambiente para segurança

// Conectar ao banco de dados
const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://mongo:tuJEDHUWjeACdoOLHlsohZTJKfKqHpWN@nozomi.proxy.rlwy.net:38247');
        console.log("Conectado ao MongoDB");
    } catch (error) {
        console.log("Erro ao conectar ao MongoDB", error);
    }
};

connectDB();

// Middleware para autenticação JWT
const autenticarToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ erro: "Acesso negado! Token não fornecido." });
    }

    try {
        const usuarioVerificado = jwt.verify(token, SECRET);
        req.usuario = usuarioVerificado; // Adiciona os dados do usuário autenticado à requisição
        next();
    } catch (error) {
        res.status(403).json({ erro: "Token inválido ou expirado!" });
    }
};

// Middleware para verificar o token
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

// Função auxiliar para preencher dias faltantes com null
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

// Função auxiliar para validar o horário de trabalho (agora permite dias sem horário)
function validarHorarioTrabalho(horarioTrabalho) {
    if (!horarioTrabalho) return false;
    // Pelo menos um dia deve ter entrada e saída preenchidos
    return Object.values(horarioTrabalho).some(
        dia => dia && dia.entrada && dia.saida
    );
}

// Cadastro de usuário
app.post("/usuarios/cadastro", async (req, res) => {
    try {
        const { nome, email, senha, foto, perfil, horarioTrabalho, role } = req.body;

        // Validação dos campos obrigatórios
        if (!nome || !email || !senha || !foto || !perfil) {
            return res.status(400).json({ erro: "Todos os campos são obrigatórios!" });
        }

        // Se não for admin, exige pelo menos um dia com horário preenchido
        if (role !== "administrador" && !validarHorarioTrabalho(horarioTrabalho)) {
            return res.status(400).json({ erro: "Pelo menos um dia da semana deve ter horário de entrada e saída preenchido!" });
        }

        // Preenche dias faltantes com null
        const horarioTrabalhoFinal = (role !== "administrador")
            ? preencherHorarioTrabalho(horarioTrabalho)
            : undefined;

        // Verifica se o usuário já existe
        const usuarioExistente = await User.findOne({ email });
        if (usuarioExistente) {
            return res.status(400).json({ erro: "Já existe uma conta com este email!" });
        }

        // Criptografa a senha antes de armazenar
        const senhaCriptografada = await bcrypt.hash(senha, 10);

        // Cria o novo usuário
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

// Login do usuário
app.post("/usuarios/login", async (req, res) => {
    try {
        const { email, senha } = req.body;

        // Verifica se o usuário existe
        const usuario = await User.findOne({ email });
        if (!usuario) {
            return res.status(400).json({ erro: "Usuário não encontrado!" });
        }

        // Verifica se a senha está correta
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(401).json({ erro: "Senha incorreta!" });
        }

        // Gera token JWT
        const token = jwt.sign(
            { _id: usuario._id, email: usuario.email, role: usuario.role },
            SECRET,
            { expiresIn: "1h" }
        );

        // Verifica o papel do usuário e retorna a rota apropriada
        if (usuario.role === "administrador") {
            res.json({
                mensagem: "Login realizado com sucesso!",
                token,
                rota: "/admin/dashboard" // Rota para administradores
            });
        } else {
            res.json({
                mensagem: "Login realizado com sucesso!",
                token,
                rota: "/funcionario/dashboard" // Rota para funcionários
            });
        }
    } catch (error) {
        res.status(500).json({ erro: "Erro ao fazer login", detalhes: error });
    }
});

// Obter dados do usuário logado
app.get("/usuarios/me", autenticarToken, async (req, res) => {
    try {
        const usuario = await User.findById(req.usuario._id).populate("frequencia");
        res.json(usuario);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao buscar usuário", detalhes: error });
    }
});

// Registrar frequência vinculada ao usuário logado
app.post("/usuarios/me/frequencia", autenticarToken, async (req, res) => {
    try {
        // Obtém o horário atual no fuso horário de Brasília
        const agora = new Date();

        // Cria uma nova frequência associada ao usuário logado
        const novaFrequencia = await Frequencia.create({
            nome: req.body.nome, // Nome enviado no corpo da requisição
            horario: agora, // Horário atual ajustado
            data: agora, // Data ajustada
            usuario: req.usuario._id // ID do usuário logado
        });

        // Adiciona a frequência ao campo `frequencia` do usuário
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

// Buscar frequências do usuário logado
app.get("/frequencias/minhas", autenticarToken, async (req, res) => {
    try {
        // Busca o usuário logado e popula as frequências
        const usuario = await User.findById(req.usuario._id).populate("frequencia");
        res.json(usuario.frequencia); // Retorna apenas as frequências
    } catch (error) {
        res.status(500).json({ erro: "Erro ao buscar frequências", detalhes: error });
    }
});

// Atualizar dados do usuário logado
app.put("/usuarios/me", autenticarToken, async (req, res) => {
    try {
        // Se não for admin, exige pelo menos um dia com horário preenchido
        if (req.usuario.role !== "administrador" && !validarHorarioTrabalho(req.body.horarioTrabalho)) {
            return res.status(400).json({ erro: "Pelo menos um dia da semana deve ter horário de entrada e saída preenchido!" });
        }
        // Preenche dias faltantes com null
        if (req.usuario.role !== "administrador") {
            req.body.horarioTrabalho = preencherHorarioTrabalho(req.body.horarioTrabalho);
        }
        const usuarioAtualizado = await User.findByIdAndUpdate(req.usuario._id, req.body, { new: true });
        res.json(usuarioAtualizado);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao atualizar usuário", detalhes: error });
    }
});

// Excluir a própria conta
app.delete("/usuarios/me", autenticarToken, async (req, res) => {
    try {
        const usuarioExcluido = await User.findByIdAndDelete(req.usuario._id);
        res.json(usuarioExcluido);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao excluir usuário", detalhes: error });
    }
});

// Obter dados de um usuário por ID (já retorna horarioTrabalho)
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


app.get("/horario-brasilia", (req, res) => {
    try {
        // Obter data e horário atual
        const now = new Date();
        
        // Formatador com timezone de Brasília
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo', 
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        const formattedDate = formatter.format(now);
        const [datePart, timePart] = formattedDate.split(', ');
        const [month, day, year] = datePart.split('/');
        const [hour, minute, second] = timePart.split(':');
        
        // Criar um objeto Date ajustado para o timezone de Brasília
        const brasiliaDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
        
        // Retornar os dados no formato ISO e componentes
        res.json({
            isoString: brasiliaDate.toISOString(),
            components: {
                year: parseInt(year, 10),
                month: parseInt(month, 10),
                day: parseInt(day, 10),
                hour: parseInt(hour, 10),
                minute: parseInt(minute, 10),
                second: parseInt(second, 10)
            },
            timestamp: brasiliaDate.getTime()
        });
    } catch (error) {
        console.error("Erro ao obter o horário:", error);
        res.status(500).json({ erro: "Erro ao obter o horário", detalhes: error.message });
    }
});

// Rota de autenticação do quiosque
app.post('/auth/kiosk', (req, res) => {
  const { kioskSecret } = req.body;
  
  // Verificação simples com uma senha fixa (temporário)
  // Idealmente, você usaria uma variável de ambiente
  if (kioskSecret === "FacePonto2025") {
    const kioskToken = jwt.sign(
      { type: 'kiosk', permissions: ['read_users'] },
      "sua_chave_secreta_jwt_aqui", // Substitua pela sua chave JWT_SECRET 
      { expiresIn: '24h' }
    );
    
    return res.json({ token: kioskToken });
  }
  
  return res.status(401).json({ error: 'Autenticação do quiosque inválida' });
});

// Rota pública para codificações faciais (temporário)
app.get('/public/usuarios/codificacoes', async (req, res) => {
  try {
    // Buscar todos os usuários com suas codificações faciais
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

// Endpoint para verificar se um usuário já registrou ponto hoje
app.get('/frequencias/verifica/:usuarioId', async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const data = req.query.data; // Formato YYYY-MM-DD
    const tipo = req.query.tipo; // "entrada" ou "saida"
    
    // Criar objeto Date para início e fim do dia, já com fuso horário explícito
    const dataInicio = new Date(`${data}T00:00:00-03:00`);
    const dataFim = new Date(`${data}T23:59:59-03:00`);
    
    // Construir filtro de busca
    const filtro = {
      usuario_id: usuarioId,
      data: { $gte: dataInicio, $lt: dataFim }
    };
    
    // Adicionar tipo de registro ao filtro, se fornecido
    if (tipo) {
      filtro.tipo_registro = tipo;
    }
    
    // Buscar registros de frequência
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

// Endpoint para registrar ponto sem autenticação
app.post('/frequencias/registrar', async (req, res) => {
  try {
    const { nome, usuario_id, data, tipo_registro } = req.body;
    
    // 1. Criar a frequência normalmente - MongoDB vai converter para UTC automaticamente 
    const novaFrequencia = new Frequencia({
      nome,
      usuario_id,
      data: new Date(data),  // A data já vem com o fuso horário correto (-03:00)
      tipo_registro: tipo_registro || 'entrada'
    });
    
    // 2. Para verificações no mesmo dia, precisamos EXTRAIR o dia local da data original
    // Vamos criar uma data local do Brasil a partir da string enviada
    const dataOriginal = new Date(data);
    
    // Extrair ano, mês e dia NO FUSO HORÁRIO DE BRASÍLIA
    const localDateString = dataOriginal.toLocaleString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    // Converter para formato YYYY-MM-DD
    const [dia, mes, ano] = localDateString.split('/');
    const dataLocalFormatada = `${ano}-${mes}-${dia}`;
    
    // 3. Criar objetos Date para início e fim do dia convertidos para UTC
    // para comparar corretamente no MongoDB
    const inicioDiaLocal = new Date(`${dataLocalFormatada}T00:00:00-03:00`);
    const fimDiaLocal = new Date(`${dataLocalFormatada}T23:59:59.999-03:00`);
    
    // 4. Usar esses objetos para consultar registros do mesmo dia
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
    
    // 5. Verificação de entrada antes da saída (mesmo dia)
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
    
    // Salvar o registro
    await novaFrequencia.save();
    
    // Retornar com detalhes para depuração
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

// Endpoint para retornar IDs de todos os usuários, exceto administradores
app.get("/usuarios/ids", autenticarToken, async (req, res) => {
    try {
        const usuarios = await User.find({ role: { $ne: "administrador" } }, { _id: 1 });
        const ids = usuarios.map(u => u._id);
        res.json(ids);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao buscar IDs dos usuários", detalhes: error.message });
    }
});

// Endpoint autenticado para obter o horário de trabalho de um usuário por ID
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

// Endpoint público para obter o horário de trabalho de um usuário por ID (para quiosque)
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

// Endpoint para retornar todos os usuários (exceto administradores)
app.get("/usuarios/todos", async (req, res) => {
    try {
        // Verificar token manualmente para depurar o problema
        const token = req.headers.authorization?.split(" ")[1];
        
        if (!token) {
            return res.status(401).json({ erro: "Acesso negado! Token não fornecido." });
        }
        
        try {
            // Usar a mesma chave do login para verificar o token
            const usuarioVerificado = jwt.verify(token, SECRET);
            
            // Se chegou até aqui, o token é válido
            const usuarios = await User.find(
                { role: { $ne: "administrador" } }, 
                { senha: 0, foto: 0 } // Exclui campos sensíveis
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

// Rota pública para dados completos de usuários (incluindo perfil mas sem dados sensíveis)
app.get('/public/usuarios/completos', async (req, res) => {
  try {
    // Buscar todos os usuários com campos necessários
    const usuarios = await User.find({}, { 
      _id: 1, 
      nome: 1, 
      foto: 1, 
      perfil: 1 // Incluindo o campo de perfil
    });
    
    res.status(200).json(usuarios.map(usuario => ({
      id: usuario._id,
      nome: usuario.nome,
      foto: usuario.foto,
      perfil: usuario.perfil // Adicionando o perfil na resposta
    })));
  // Lembrar de fazer mudança do admin
  } catch (error) {
    console.error('Erro ao buscar dados dos usuários:', error);
    res.status(500).json({ erro: 'Erro ao buscar dados dos usuários' });
  }
});

app.listen(PORT, () => console.log(`O servidor está rodando na porta ${PORT}`));
