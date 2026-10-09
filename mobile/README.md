# Bookrats - widget Android

App Expo com um widget de tela inicial que mostra o progresso de leitura dos dois leitores.

## Gerar o APK

Em uma máquina com Android SDK e JDK:

```sh
npm install
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
```

O APK fica em `android/app/build/outputs/apk/release/`. A chave de debug é aceitável para uso pessoal.

Alternativa com EAS (precisa de uma conta Expo gratuita):

```sh
npx eas build -p android --profile preview
```

## Instalar e configurar

1. Instale o APK no celular (permita instalar de fontes desconhecidas).
2. Abra o app Bookrats, preencha "Endereço do servidor" e "Token", toque em "Salvar" e depois em "Testar".
3. Na tela inicial, pressione e segure, escolha "Widgets" e adicione o widget "Bookrats".
4. Toque no widget para atualizar. Sem conexão, ele mostra os últimos valores com "desatualizado".

Capas de livros ainda não são exibidas no widget.
