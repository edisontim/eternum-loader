import { AppProvider } from "./context";
import { LoaderApp } from "./loader-app";

export const App = () => {
  return (
    <AppProvider>
      <LoaderApp />
    </AppProvider>
  );
};
