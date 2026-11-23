# Guia de instalação (Mac) · Plataforma de Roteiros Visions

Projeto Firebase: `visionscontent-cba52`. Não precisa de `gcloud`.

## 1. Preparar o Mac (uma vez só)

1. Instale o **Node.js**: entre em https://nodejs.org, baixe a versão **LTS** e rode o instalador.
2. Abra o **Terminal** e confira (deve aparecer um número de versão):
   ```bash
   node -v
   ```
3. Instale a ferramenta do Firebase (vai pedir a senha do Mac; ao digitar, nada aparece na tela, é normal):
   ```bash
   sudo npm install -g firebase-tools
   ```
4. Entre na sua conta Google do Firebase (abre o navegador):
   ```bash
   firebase login
   ```

## 2. Baixar o código

1. Abra no navegador (logado no GitHub):
   https://github.com/assessoriavisions-stack/visionscontent/archive/refs/heads/claude/amazing-brown-acqexb.zip
2. Dê dois cliques no ZIP baixado para descompactar.
3. No Terminal, entre na pasta:
   ```bash
   cd ~/Downloads/visionscontent-claude-amazing-brown-acqexb
   ```

## 3. Apagar os dados do sistema antigo

1. Apagar todo o Firestore (vai pedir confirmação):
   ```bash
   firebase firestore:delete --all-collections --project visionscontent-cba52
   ```
2. Apagar os usuários antigos: no Console do Firebase, **Authentication > Usuários**,
   marque todos e apague.

## 4. Chave da Anthropic (IA)

Crie uma chave em https://console.anthropic.com (Settings > API Keys) e guarde no Secret Manager
do Firebase. O comando pede para colar a chave; ela não aparece na tela e nunca vai para o site.
```bash
firebase functions:secrets:set ANTHROPIC_API_KEY --project visionscontent-cba52
```

## 5. Publicar o backend (regras + functions)

```bash
cd functions && npm install && cd ..
```
```bash
firebase deploy --only firestore:rules,functions --project visionscontent-cba52
```
- Na primeira vez o Firebase pode pedir para ativar APIs: responda **Y**.
- Se aparecer a pergunta para apagar functions antigas (do sistema anterior): responda **Y**.

## 6. Criar o seu login de admin (pelo Console)

1. **Authentication > Usuários > Adicionar usuário**: seu e-mail e uma senha.
2. Copie o **UID do usuário** que aparece na lista.
3. **Firestore Database > Iniciar coleção**:
   - ID da coleção: `admins`
   - ID do documento: cole o **UID**
   - Campo: `email` (string) com o seu e-mail. Salve.

Esse documento só pode ser criado pelo Console: ninguém consegue se tornar admin pelo app.

## 7. Fechar o cadastro aberto

**Authentication > Configurações > Ações do usuário**: desmarque **Ativar criação (inscrição)**.
Assim só o admin cria logins (pelo painel da plataforma).

## 8. Config web e site

1. **Configurações do projeto > Seus apps > Configuração do SDK**: copie `apiKey`,
   `messagingSenderId` e `appId` para o `FIREBASE_CONFIG` do `index.html` (ou mande para o Claude).
2. Publique a pasta no Netlify.
3. **Authentication > Configurações > Domínios autorizados**: adicione o domínio do Netlify.
4. Entre no site com o seu login de admin e toque em **Criar agora** no aviso de configurações iniciais.

## 9. Teste da geração com a IA de verdade (opcional, recomendado)

Gera 20 roteiros variados com um perfil de demonstração e confere que nenhum trecho com cara de IA
chega sem marcação. Custa alguns dólares na conta da Anthropic e leva uns 10 minutos.
Dentro da pasta do projeto:
```bash
cd functions && npm install
```
```bash
read -s ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY && node scripts/testeRealGeracao.js
```
O `read -s` espera você colar a chave (não aparece na tela) e apertar Enter. No fim aparece
"ACEITE OK" ou "ACEITE FALHOU", e o arquivo `teste-real-resultado.json` com os roteiros completos.

## 10. Lembretes por push (uma vez)

No Console do Firebase: **Configurações do projeto > Cloud Messaging > Configuração da Web >
Certificados push da Web > Gerar par de chaves**. Copie a chave pública (um texto longo) e mande para o
Claude colocar no `index.html`. Sem ela, os lembretes continuam aparecendo no sino dentro do app.
