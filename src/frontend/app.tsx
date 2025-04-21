import { Provider } from "./context";
import { LoaderApp } from "./loader-app";

export const App = () => {
  return (
    <Provider>
      <LoaderApp />
    </Provider>
  );
};
