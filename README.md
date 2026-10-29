# Extension Auto Reloader

Monitoriza uma pasta escolhida pelo utilizador e recarrega automaticamente todas as extensões Chromium ativas carregadas sem compactação.

## Instalação

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Ative o modo de programador.
3. Carregue esta pasta sem compactação.
4. Abra o popup e escolha `C:\Users\steven.camara\Extensões`.
5. Repita a configuração no outro navegador.

No popup, pode indicar um ou mais IDs de extensões (um por linha). Com a lista vazia, todas as extensões de desenvolvimento ativas são recarregadas.

A permissão da pasta é guardada separadamente em cada perfil do navegador. A própria extensão Auto Reloader não se recarrega a si mesma.
