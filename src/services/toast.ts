import Toast from "react-native-toast-message";

export const toast = {
  success(title: string, message?: string) {
    Toast.show({
      type: "success",
      text1: title,
      text2: message,
      position: "top",
      visibilityTime: 3000
    });
  },

  error(title: string, message?: string) {
    Toast.show({
      type: "error",
      text1: title,
      text2: message,
      position: "top",
      visibilityTime: 5000
    });
  },

  info(title: string, message?: string) {
    Toast.show({
      type: "info",
      text1: title,
      text2: message,
      position: "top",
      visibilityTime: 3500
    });
  },

  warning(title: string, message?: string) {
    Toast.show({
      type: "warning",
      text1: title,
      text2: message,
      position: "top",
      visibilityTime: 4000
    });
  }
};

export default toast;
