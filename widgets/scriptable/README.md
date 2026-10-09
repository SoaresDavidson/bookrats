# Widget Scriptable (iPhone)

1. Instale o app **Scriptable** pela App Store.
2. Abra o Scriptable, toque em **+** para criar um novo script e dê o nome `Bookrats`.
3. Cole o conteúdo de `bookrats.js` no script.
4. No topo, preencha as constantes:
   - `BASE`: endereço do servidor, por exemplo `https://bookrats.exemplo.com`
   - `TOKEN`: token impresso por `bookrats add-user`
5. Na tela inicial, mantenha pressionado, toque em **+**, escolha **Scriptable** e o tamanho (pequeno ou médio).
6. Toque no widget adicionado e, em **Script**, escolha `Bookrats`. "When Interacting: Open URL" não é necessário: o toque abre `BASE/app/` por meio de `widget.url`.

Sem conexão, o widget mostra os últimos valores com a marca "desatualizado". Ele pede atualização a cada 15 minutos (a critério do iOS).
