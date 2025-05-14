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

// Cadastro de usuário
app.post("/usuarios/cadastro", async (req, res) => {
    try {
        const { nome, cpf, email, senha, foto, perfil } = req.body;

        // Verifica se o usuário já existe
        const usuarioExistente = await User.findOne({ $or: [{ email }, { cpf }] });
        if (usuarioExistente) {
            return res.status(400).json({ erro: "Já existe uma conta com este email ou CPF!" });
        }

        // Criptografa a senha antes de armazenar
        const senhaCriptografada = await bcrypt.hash(senha, 10);

        // Cria o novo usuário
        const novoUsuario = await User.create({
            nome,
            cpf,
            email,
            senha: senhaCriptografada,
            foto,
            perfil, // Salva a imagem em Base64 no campo perfil
            role: "funcionario"
        });

        res.status(201).json(novoUsuario);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao cadastrar usuário", detalhes: error });
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

// Obter dados de um usuário por ID
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
app.listen(PORT, () => console.log(`O servidor está rodando na porta ${PORT}`));



