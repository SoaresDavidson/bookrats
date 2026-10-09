# Bookrats - widget Android

App Expo com um widget de tela inicial que mostra o progresso de leitura dos dois leitores.

## Gerar o APK

O caminho mais simples é o EAS (precisa de uma conta Expo gratuita, sem Android SDK local):

```sh
npm install
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

Na primeira vez o EAS pergunta se pode criar o projeto e a keystore; aceite. Ao terminar, o comando mostra um link: baixe o APK por ele (dá para abrir direto no celular).

### Alternativa: build local

Em uma máquina com Android SDK e JDK:

```sh
npm install
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
```

O APK fica em `android/app/build/outputs/apk/release/`. A chave de debug é aceitável para uso pessoal.

## Instalar e configurar

1. Instale o APK no celular (permita instalar de fontes desconhecidas).
2. Abra o app Bookrats, preencha "Endereço do servidor" (`https://bookrats.tail5cb356.ts.net`) e "Token", toque em "Salvar" e depois em "Testar".
3. Na tela inicial, pressione e segure, escolha "Widgets" e adicione o widget "Bookrats".
4. Toque no widget para atualizar. Sem conexão, ele mostra os últimos valores com "desatualizado".

Capas de livros ainda não são exibidas no widget.
